import type { StageExecutor } from "@repo/kanban-contract";

/**
 * The local runner polls for its work and learns about a stop on its next heartbeat, so the
 * board has nothing to send it: dispatch and cancel only record that the run is local.
 */
export function createLocalExecutor(): StageExecutor {
    return {
        kind: "local",
        dispatch: () => Promise.resolve({ ok: true, sessionUrl: null }),
        cancel: () => Promise.resolve(),
    };
}
