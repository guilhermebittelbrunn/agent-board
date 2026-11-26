import type { StageExecutorKind } from "@repo/kanban-contract";
import { isRunnerOnline } from "@/(shared)/lib/runner/runner-claim";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { resolveStageExecutorMode } from "./executor-mode";

/** The executor a stage triggered by `userId` would get now: one read of their runners. */
export async function resolveExecutorFor(
    userId: string,
    now = new Date()
): Promise<StageExecutorKind | null> {
    const runners = await runnerRepository.listByUser(userId);
    return resolveStageExecutorMode({
        hasOnlineRunner: runners.some((runner) => isRunnerOnline(runner, now)),
    });
}

export async function executorsForUsers(
    userIds: string[],
    now: Date
): Promise<Map<string, StageExecutorKind | null>> {
    const distinct = [...new Set(userIds)];
    const kinds = await Promise.all(
        distinct.map((userId) => resolveExecutorFor(userId, now))
    );
    return new Map(distinct.map((userId, index) => [userId, kinds[index]]));
}
