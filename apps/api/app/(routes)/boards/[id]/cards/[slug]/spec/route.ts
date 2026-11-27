import { specBody } from "@repo/kanban-contract/spec-frontmatter";
import type { CardSpecContentDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { getGithubClient } from "@/(shared)/lib/github/github-client";
import {
    githubAppNotConfiguredResponse,
    githubErrorResponse,
} from "@/(shared)/lib/github/github-errors";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

/**
 * The spec body as it is now on the branch it lives on (the card branch for a draft or a
 * board-born card not yet merged, the base branch otherwise), without the frontmatter.
 * Reading it does not update the card.
 */
export const GET = requireBoardApi<CardRouteParams>(
    "view",
    async (_req, ctx) => {
        const card = await cardRepository.findBySlug(
            ctx.board.id,
            ctx.params.slug
        );
        if (!card) {
            return Response.json(
                { error: { code: "CARD_NOT_FOUND" } },
                { status: HTTP_STATUS.NOT_FOUND }
            );
        }
        const client = getGithubClient();
        if (!client) {
            return githubAppNotConfiguredResponse();
        }

        const ref = card.spec.ref ?? ctx.board.config.baseBranch;
        try {
            const file = await client.readFile(
                ctx.board.repository,
                card.spec.path,
                ref
            );
            const data: CardSpecContentDTO = {
                path: card.spec.path,
                ref,
                sha: file?.sha ?? null,
                content: file ? specBody(file.content) : null,
            };
            return Response.json({ data });
        } catch (error) {
            const response = githubErrorResponse(error);
            if (!response) {
                throw error;
            }
            return response;
        }
    }
);
