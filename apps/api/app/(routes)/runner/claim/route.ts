import type { RunnerClaimResult } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { mintRunToken } from "@/(shared)/lib/agent-contract/run-token";
import { requireRunnerApi } from "@/(shared)/lib/runner/runner-guard";
import { toRunnerJob } from "@/(shared)/lib/runner/runner-job";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";

/** The runner's poll: hands over the next run its owner triggered, with that run's token. */
export const POST = requireRunnerApi(async (_req, ctx) => {
    const claimed = await runnerRepository.claimNext(
        ctx.runner,
        mintRunToken,
        ctx.now
    );
    if (claimed === null) {
        const data: RunnerClaimResult = { job: null };
        return Response.json({ data });
    }
    const board = await boardRepository.findById(claimed.run.boardId);
    if (board === null) {
        return Response.json(
            { error: { code: "BOARD_NOT_FOUND" } },
            { status: HTTP_STATUS.NOT_FOUND }
        );
    }
    logEvent("runner", "claimed", {
        runnerId: ctx.runner.id,
        runId: claimed.run.id,
    });
    const data: RunnerClaimResult = {
        job: toRunnerJob(claimed.run, board, claimed.token),
    };
    return Response.json({ data });
});
