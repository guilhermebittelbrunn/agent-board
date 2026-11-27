import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { nextTasksOrder } from "@/(shared)/lib/card-order";
import {
    type GithubFile,
    getGithubClient,
} from "@/(shared)/lib/github/github-client";
import {
    githubAppNotConfiguredResponse,
    githubErrorResponse,
} from "@/(shared)/lib/github/github-errors";
import {
    checkDraftApprovable,
    planSpecApproval,
} from "@/(shared)/lib/spec-draft";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

const APPROVAL_REFUSAL_STATUS = {
    CARD_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
    CARD_NOT_DRAFT: HTTP_STATUS.CONFLICT,
    CARD_RUN_ACTIVE: HTTP_STATUS.CONFLICT,
    CARD_SPEC_NOT_READY: HTTP_STATUS.CONFLICT,
} as const;

/** Approves the spec written on the card branch and sends the draft to the end of Tasks. */
export const POST = requireBoardApi<CardRouteParams>(
    "prioritize",
    async (_req, ctx) => {
        const card = await cardRepository.findBySlug(
            ctx.board.id,
            ctx.params.slug
        );
        if (!card) {
            return errorResponse("CARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
        }
        const refusal = checkDraftApprovable(card);
        if (refusal) {
            return errorResponse(refusal.code, refusal.status);
        }
        const github = getGithubClient();
        if (!github) {
            return githubAppNotConfiguredResponse();
        }

        let file: GithubFile | null;
        try {
            file = await github.readFile(
                ctx.board.repository,
                card.spec.path,
                card.spec.ref ?? card.branch ?? ctx.board.config.baseBranch
            );
        } catch (error) {
            const response = githubErrorResponse(error);
            if (!response) {
                throw error;
            }
            return response;
        }

        const plan = planSpecApproval({
            card,
            file,
            config: ctx.board.config,
            by: { userId: ctx.profile.id, login: ctx.member.login },
            order: nextTasksOrder(
                (await cardRepository.listByBoard(ctx.board.id)).filter(
                    (candidate) => candidate.lane === "tasks"
                )
            ),
            now: new Date(),
        });
        if (!plan.ok) {
            return errorResponse(plan.code, plan.status);
        }

        const approved = await cardRepository.approveDraft(card.id, plan.patch);
        if (!approved.ok) {
            return errorResponse(
                approved.code,
                APPROVAL_REFUSAL_STATUS[approved.code]
            );
        }
        return Response.json({ data: toCardDTO(approved.card) });
    }
);
