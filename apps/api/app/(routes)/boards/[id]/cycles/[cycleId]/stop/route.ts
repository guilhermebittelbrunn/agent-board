import { stopCycle } from "@/(shared)/lib/orchestrator/cycle";
import { toCycleDTO } from "@/(shared)/mappers/cycle.mapper";
import { requireBoardApi } from "@/app/(guards)/board";

type CycleRouteParams = { id: string; cycleId: string };

/** Stops the cycle and the stages its specs are running; the cards stay where they are. */
export const POST = requireBoardApi<CycleRouteParams>(
    "trigger",
    async (_req, ctx) => {
        const result = await stopCycle({
            board: ctx.board,
            cycleId: ctx.params.cycleId,
            by: { userId: ctx.profile.id, login: ctx.member.login },
            now: new Date(),
        });
        if (!result.ok) {
            return Response.json(
                { error: { code: result.code } },
                { status: result.status }
            );
        }
        return Response.json({ data: toCycleDTO(result.cycle) });
    }
);
