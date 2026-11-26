import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { sortCards } from "@/(shared)/lib/card-order";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { parseReorderCards } from "@/(shared)/validation/card.schema";
import { requireBoardApi } from "@/app/(guards)/board";

/**
 * The caller sends the whole Tasks queue. If it is not exactly the ready cards in Tasks,
 * someone synced or moved a card in the meantime, and writing would lose that change.
 */
export const PUT = requireBoardApi("prioritize", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseReorderCards(body.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const { slugs } = parsed.value;

    const cards = await cardRepository.listByBoard(ctx.board.id);
    const queue = new Set(
        cards
            .filter((card) => card.lane === "tasks" && card.ready)
            .map((card) => card.slug)
    );
    if (queue.size !== slugs.length || slugs.some((slug) => !queue.has(slug))) {
        return Response.json(
            { error: { code: "CARD_ORDER_STALE" } },
            { status: HTTP_STATUS.CONFLICT }
        );
    }

    await cardRepository.reorder(ctx.board.id, slugs);
    const updated = await cardRepository.listByBoard(ctx.board.id);
    return Response.json({ data: sortCards(updated).map(toCardDTO) });
});
