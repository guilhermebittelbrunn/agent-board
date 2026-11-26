import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { toCardEventView } from "@/(shared)/mappers/card-event.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

/** Oldest first: the screen groups the events by stage and puts the newest on top. */
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
        const events = await cardEventRepository.listByCard(card.id);
        return Response.json({
            data: events.map((event) =>
                toCardEventView(event, ctx.subjectProfile.id)
            ),
        });
    }
);
