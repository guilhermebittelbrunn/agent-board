import type { RunnerJob } from "@repo/kanban-contract";
import type { BoardDTO } from "@repo/sdk/src/types";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";

export function toRunnerJob(
    run: RunRecord,
    board: Pick<BoardDTO, "repository" | "config">,
    runToken: string
): RunnerJob {
    return {
        runId: run.id,
        boardId: run.boardId,
        cardId: run.cardId,
        slug: run.slug,
        stageKey: run.stageKey,
        command: run.command,
        agent: run.agent,
        model: run.model,
        effort: run.effort,
        maxTurns: run.maxTurns,
        branch: run.branch,
        repository: {
            owner: board.repository.owner,
            name: board.repository.name,
            baseBranch: board.config.baseBranch,
        },
        install: board.config.environment.install ?? null,
        deadlineAt: run.deadlineAt ?? "",
        runToken,
        cycleId: run.cycleId,
    };
}
