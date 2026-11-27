import type { CycleDetailDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { toCycleDetail } from "@/(shared)/lib/cycle-detail";
import { reconcileCycle } from "@/(shared)/lib/orchestrator/cycle";
import { tickSafely } from "@/(shared)/lib/orchestrator/tick-safely";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { cycleRepository } from "@/(shared)/repositories/cycle.repository";
import { requireBoardApi } from "@/app/(guards)/board";

type CycleRouteParams = { id: string; cycleId: string };

const MAX_CYCLE_EVENTS = 200;

export const GET = requireBoardApi<CycleRouteParams>(
    "view",
    async (_req, ctx) => {
        await tickSafely(ctx.board);
        const found = await cycleRepository.findInBoard(
            ctx.board.id,
            ctx.params.cycleId
        );
        if (found === null) {
            return Response.json(
                { error: { code: "CYCLE_NOT_FOUND" } },
                { status: HTTP_STATUS.NOT_FOUND }
            );
        }
        let cycle = found;
        let cards = await cardRepository.listByBoard(ctx.board.id);
        if (await reconcileCycle(ctx.board, cycle, cards, new Date())) {
            cycle =
                (await cycleRepository.findInBoard(ctx.board.id, cycle.id)) ??
                found;
            cards = await cardRepository.listByBoard(ctx.board.id);
        }
        const events = await cardEventRepository.listByCycle(
            cycle.id,
            MAX_CYCLE_EVENTS
        );
        const data: CycleDetailDTO = toCycleDetail(cycle, cards, events);
        return Response.json({ data });
    }
);
