import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { ensurePullRequest } from "@/(shared)/lib/pull-request/pull-request-open";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

const errorResponse = (code: string, status: number): Response =>
    Response.json({ error: { code } }, { status });

/**
 * Opens the pull request of a card on the pull request stage again, after the automatic
 * attempt failed. A card whose pull request is already open is returned unchanged.
 */
export const POST = requireBoardApi<CardRouteParams>(
    "trigger",
    async (_req, ctx) => {
        const card = await cardRepository.findBySlug(
            ctx.board.id,
            ctx.params.slug
        );
        if (!card) {
            return errorResponse("CARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
        }
        const result = await ensurePullRequest({
            board: ctx.board,
            cardId: card.id,
            dispatchAs: { userId: ctx.profile.id, login: ctx.member.login },
        });
        if (!result.ok) {
            return errorResponse(result.code, result.status);
        }
        return Response.json({ data: toCardDTO(result.card) });
    }
);
