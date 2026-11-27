import type { CycleDTO } from "@repo/sdk/src/types";

/** How often a cycle is read again while it waits in the queue or runs. */
export const ACTIVE_CYCLE_REFETCH_MS = 5000;

export const isCycleLive = (cycle: Pick<CycleDTO, "status">): boolean =>
    cycle.status === "queued" || cycle.status === "running";

/** The `refetchInterval` of a query of cycles: polls only while one is live. */
export function activeCycleRefetchInterval(
    data: Pick<CycleDTO, "status"> | Pick<CycleDTO, "status">[] | undefined
): number | false {
    if (data === undefined) {
        return false;
    }
    const live = Array.isArray(data)
        ? data.some(isCycleLive)
        : isCycleLive(data);
    return live ? ACTIVE_CYCLE_REFETCH_MS : false;
}
