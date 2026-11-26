import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { tickSafely } from "@/(shared)/lib/orchestrator/tick-safely";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

export const GET = requireBoardApi<CardRouteParams>(
    "view",
    async (_req, ctx) => {
        await tickSafely(ctx.board);
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
        return Response.json({ data: toCardDTO(card) });
    }
);
