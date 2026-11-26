import {
    RUNNER_CLAIM_GRACE_MS,
    RUNNER_ONLINE_WINDOW_MS,
} from "@repo/kanban-contract";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";
import type { RunnerRecord } from "@/(shared)/mappers/runner.mapper";

export function isRunnerOnline(
    runner: Pick<RunnerRecord, "lastSeenAt" | "deletedAt">,
    now: Date
): boolean {
    return (
        runner.deletedAt === null &&
        now.getTime() - Date.parse(runner.lastSeenAt) <= RUNNER_ONLINE_WINDOW_MS
    );
}

/**
 * The oldest local run this runner may take: started, unclaimed, still inside its deadline,
 * and triggered by the person who registered the runner. A subscription is for its owner's
 * own use, so a runner never runs what someone else triggered.
 */
export function pickClaimable(
    runs: RunRecord[],
    runner: Pick<RunnerRecord, "userId">,
    now: Date
): RunRecord | null {
    const claimable = runs.filter(
        (run) =>
            run.active &&
            run.status === "running" &&
            run.executor === "local" &&
            run.runnerId === null &&
            run.triggeredBy.userId === runner.userId &&
            run.deadlineAt !== null &&
            Date.parse(run.deadlineAt) > now.getTime()
    );
    claimable.sort((left, right) =>
        (left.startedAt ?? left.queuedAt).localeCompare(
            right.startedAt ?? right.queuedAt
        )
    );
    return claimable[0] ?? null;
}

/** Local runs nobody claimed in time: the runner went offline after the trigger. */
export function findUnclaimed(runs: RunRecord[], now: Date): RunRecord[] {
    return runs.filter(
        (run) =>
            run.active &&
            run.status === "running" &&
            run.executor === "local" &&
            run.runnerId === null &&
            run.startedAt !== null &&
            now.getTime() - Date.parse(run.startedAt) >= RUNNER_CLAIM_GRACE_MS
    );
}
