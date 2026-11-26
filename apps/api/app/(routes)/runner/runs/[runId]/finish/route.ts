import type { RunnerFinishResult } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { finishMarkdown } from "@/(shared)/lib/runner/runner-finish";
import { requireRunnerApi } from "@/(shared)/lib/runner/runner-guard";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { parseRunnerFinish } from "@/(shared)/validation/runner.schema";

type RunRouteParams = { runId: string };

/**
 * The runner is done with a run: frees the runner and writes how long it took. Moving the
 * card is not this route's job; the agent's `complete_stage` (or the runner's, on its
 * behalf) goes through the orchestrator. A repeated finish writes nothing.
 */
export const POST = requireRunnerApi<RunRouteParams>(async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseRunnerFinish(body.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const finished = await runnerRepository.finishRun(
        ctx.runner,
        ctx.params.runId,
        { turns: parsed.value.turns },
        ctx.now
    );
    if (!finished.ok) {
        return Response.json(
            { error: { code: finished.code } },
            { status: HTTP_STATUS.FORBIDDEN }
        );
    }
    const { run } = finished;
    if (finished.recorded) {
        await cardEventRepository.appendAgentEvent(
            { id: run.cardId },
            {
                boardId: run.boardId,
                cardId: run.cardId,
                stageKey: run.stageKey,
                lane: "stage",
                type: "update",
                author: { kind: "agent", name: run.agent ?? run.command },
                markdown: finishMarkdown(run, ctx.runner, parsed.value),
                runId: run.id,
            }
        );
        logEvent("runner", "finished", {
            runnerId: ctx.runner.id,
            runId: run.id,
            exit: parsed.value.exit,
        });
    }
    const data: RunnerFinishResult = { recorded: finished.recorded };
    return Response.json({ data });
});
