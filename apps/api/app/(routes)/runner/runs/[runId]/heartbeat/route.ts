import type { RunnerHeartbeatResult } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { requireRunnerApi } from "@/(shared)/lib/runner/runner-guard";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { parseRunnerHeartbeat } from "@/(shared)/validation/runner.schema";

type RunRouteParams = { runId: string };

/**
 * The board never opens a connection to a runner: `active: false` here is how a stop on the
 * board reaches the machine.
 */
export const POST = requireRunnerApi<RunRouteParams>(async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseRunnerHeartbeat(body.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const checked = await runnerRepository.recordTurns(
        ctx.runner,
        ctx.params.runId,
        parsed.value.turns,
        ctx.now
    );
    if (!checked.ok) {
        return Response.json(
            { error: { code: checked.code } },
            { status: HTTP_STATUS.FORBIDDEN }
        );
    }
    const data: RunnerHeartbeatResult = { active: checked.run.active };
    return Response.json({ data });
});
