import {
    type BoardConfig,
    type RunnerKind,
    type StageExecutorChoice,
    type StageExecutorKind,
    stageRunnersOf,
} from "@repo/kanban-contract";
import { isRunnerOnline } from "@/(shared)/lib/runner/runner-claim";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { chooseStageExecutorMode } from "./executor-mode";

type StageRunners = { runners: readonly RunnerKind[] };

async function hasOnlineRunner(userId: string, now: Date): Promise<boolean> {
    const runners = await runnerRepository.listByUser(userId);
    return runners.some((runner) => isRunnerOnline(runner, now));
}

/** The executor a stage triggered by `userId` would get now: one read of their runners. */
export async function chooseExecutorFor(
    userId: string,
    now = new Date(),
    stage?: StageRunners
): Promise<StageExecutorChoice> {
    return chooseStageExecutorMode({
        hasOnlineRunner: await hasOnlineRunner(userId, now),
        stageRunners: stage?.runners,
    });
}

/** Whether the person has an executor for a stage that accepts every runner. */
export async function resolveExecutorFor(
    userId: string,
    now = new Date()
): Promise<StageExecutorKind | null> {
    const choice = await chooseExecutorFor(userId, now);
    return choice.ok ? choice.executor : null;
}

/** The executor each queued run gets, reading the runners of each person once. */
export async function executorsForRuns(
    runs: Pick<RunRecord, "id" | "stageKey" | "triggeredBy">[],
    config: Pick<BoardConfig, "stages" | "specAuthoring">,
    now: Date
): Promise<Map<string, StageExecutorChoice>> {
    const people = [...new Set(runs.map((run) => run.triggeredBy.userId))];
    const online = await Promise.all(
        people.map((userId) => hasOnlineRunner(userId, now))
    );
    const onlineByUser = new Map(
        people.map((userId, index) => [userId, online[index]])
    );
    return new Map(
        runs.map((run) => [
            run.id,
            chooseStageExecutorMode({
                hasOnlineRunner:
                    onlineByUser.get(run.triggeredBy.userId) ?? false,
                stageRunners: stageRunnersOf(config, run.stageKey)?.runners,
            }),
        ])
    );
}
