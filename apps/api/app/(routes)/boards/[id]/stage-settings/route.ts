import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { toBoardView } from "@/(shared)/lib/board-view";
import { resolveExecutorFor } from "@/(shared)/lib/orchestrator/executor-choice";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toStageSettings } from "@/(shared)/mappers/board.mapper";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { parseStageSettings } from "@/(shared)/validation/run.schema";
import { requireBoardApi } from "@/app/(guards)/board";

/** The board's own limits and approval per stage; columns, commands and models stay in board.yml. */
export const PATCH = requireBoardApi("configure", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseStageSettings(body.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const known = new Set(ctx.board.config.stages.map((stage) => stage.key));
    if (Object.keys(parsed.value.stages).some((key) => !known.has(key))) {
        return Response.json(
            { error: { code: "VALIDATION_FAILED" } },
            { status: HTTP_STATUS.BAD_REQUEST }
        );
    }

    const stageSettings = toStageSettings(
        parsed.value.stages,
        ctx.board.config
    );
    const updated = await boardRepository.updateStageSettings(
        ctx.board.id,
        stageSettings
    );
    if (!updated) {
        return Response.json(
            { error: { code: "BOARD_NOT_FOUND" } },
            { status: HTTP_STATUS.NOT_FOUND }
        );
    }
    return Response.json({
        data: toBoardView(
            updated,
            ctx.access,
            await resolveExecutorFor(ctx.profile.id)
        ),
    });
});
