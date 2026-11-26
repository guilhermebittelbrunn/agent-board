import { sortCards } from "@/(shared)/lib/card-order";
import { tickSafely } from "@/(shared)/lib/orchestrator/tick-safely";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

export const GET = requireBoardApi("view", async (_req, ctx) => {
    await tickSafely(ctx.board);
    const cards = await cardRepository.listByBoard(ctx.board.id);
    return Response.json({ data: sortCards(cards).map(toCardDTO) });
});
