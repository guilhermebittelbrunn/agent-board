import type { CardDTO, CycleDecisionDTO, CycleDTO } from "@repo/sdk/src/types";

export type CycleCounters = {
    pullRequests: number;
    done: number;
    decisions: number;
    review: number;
    /** `null` while the cycle waits in the queue. */
    elapsedMs: number | null;
};

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

export function cycleCounters(
    cycle: Pick<CycleDTO, "items" | "startedAt" | "finishedAt">,
    cards: readonly Pick<CardDTO, "pullRequest">[],
    decisions: readonly Pick<CycleDecisionDTO, "product">[],
    now: Date
): CycleCounters {
    const end =
        cycle.finishedAt === null
            ? now.getTime()
            : Date.parse(cycle.finishedAt);
    return {
        pullRequests: cards.filter((card) => card.pullRequest?.state === "open")
            .length,
        done: cycle.items.filter((item) => item.status === "done").length,
        decisions: decisions.length,
        review: decisions.filter((decision) => decision.product).length,
        elapsedMs:
            cycle.startedAt === null
                ? null
                : Math.max(0, end - Date.parse(cycle.startedAt)),
    };
}

/** Whole minutes and hours, the way the cycle screen shows how long it has run. */
export function splitElapsed(ms: number): { hours: number; minutes: number } {
    const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
    return {
        hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
        minutes: totalMinutes % MINUTES_PER_HOUR,
    };
}
