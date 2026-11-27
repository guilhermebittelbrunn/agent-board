import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { createCycle } from "@/(shared)/lib/orchestrator/cycle";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toCycleDTO } from "@/(shared)/mappers/cycle.mapper";
import { cycleRepository } from "@/(shared)/repositories/cycle.repository";
import { parseCreateCycle } from "@/(shared)/validation/cycle.schema";
import { requireBoardApi } from "@/app/(guards)/board";

export const GET = requireBoardApi("view", async (_req, ctx) => {
    const cycles = await cycleRepository.listByBoard(ctx.board.id);
    return Response.json({ data: cycles.map(toCycleDTO) });
});

/** Starts a cycle, or queues it behind the one the board is running. */
export const POST = requireBoardApi("trigger", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseCreateCycle(body.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const result = await createCycle({
        board: ctx.board,
        input: parsed.value,
        by: { userId: ctx.profile.id, login: ctx.member.login },
        now: new Date(),
    });
    if (!result.ok) {
        return Response.json(
            { error: { code: result.code } },
            { status: result.status }
        );
    }
    return Response.json(
        { data: toCycleDTO(result.cycle) },
        { status: HTTP_STATUS.CREATED }
    );
});
