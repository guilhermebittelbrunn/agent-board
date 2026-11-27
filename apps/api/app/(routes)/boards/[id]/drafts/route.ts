import { SPEC_STAGE_KEY } from "@repo/kanban-contract";
import type { CreateSpecDraftResultDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { getGithubClient } from "@/(shared)/lib/github/github-client";
import {
    githubAppNotConfiguredResponse,
    githubErrorResponse,
} from "@/(shared)/lib/github/github-errors";
import { chooseExecutorFor } from "@/(shared)/lib/orchestrator/executor-choice";
import { triggerStage } from "@/(shared)/lib/orchestrator/orchestrator";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import {
    createSpecDraft,
    resolveDraftAttachments,
} from "@/(shared)/lib/spec-draft";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { toRunDTO } from "@/(shared)/mappers/run.mapper";
import { parseCreateSpecDraft } from "@/(shared)/validation/spec-draft.schema";
import { requireBoardApi } from "@/app/(guards)/board";

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

/**
 * Creates a spec draft in Drafts and queues its writing. Without an executor nothing is
 * created: a draft that nobody can run would only sit in the column.
 */
export const POST = requireBoardApi("trigger", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseCreateSpecDraft(body.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const choice = await chooseExecutorFor(
        ctx.profile.id,
        new Date(),
        ctx.board.config.specAuthoring
    );
    if (!choice.ok) {
        return choice.refusal === "stage_not_served"
            ? errorResponse("RUN_NO_CREDENTIAL_FOR_STAGE", HTTP_STATUS.CONFLICT)
            : errorResponse(
                  "RUN_EXECUTOR_UNAVAILABLE",
                  HTTP_STATUS.SERVICE_UNAVAILABLE
              );
    }
    const github = getGithubClient();
    if (!github) {
        return githubAppNotConfiguredResponse();
    }

    const attachments = await resolveDraftAttachments(
        parsed.value.attachments,
        ctx.profile.id
    );
    if (!attachments.ok) {
        return errorResponse(attachments.code, attachments.status);
    }

    const by = { userId: ctx.profile.id, login: ctx.member.login };
    let created: Awaited<ReturnType<typeof createSpecDraft>>;
    try {
        created = await createSpecDraft({
            board: ctx.board,
            text: parsed.value.text,
            attachments: attachments.value,
            by,
            github,
        });
    } catch (error) {
        const response = githubErrorResponse(error);
        if (!response) {
            throw error;
        }
        return response;
    }
    if (!created.ok) {
        return errorResponse(created.code, created.status);
    }

    const triggered = await triggerStage({
        board: ctx.board,
        slug: created.card.slug,
        stageKey: SPEC_STAGE_KEY,
        by,
        trigger: "drag",
    });
    // The card exists even when the writing could not be queued; its page offers to run it again.
    const data: CreateSpecDraftResultDTO = triggered.ok
        ? { card: toCardDTO(triggered.card), run: toRunDTO(triggered.run) }
        : { card: toCardDTO(created.card), run: null };
    return Response.json({ data }, { status: HTTP_STATUS.CREATED });
});
