import { isEmulated } from "@repo/auth/emulator";
import type { StageExecutorKind } from "@repo/kanban-contract";

/**
 * Who runs a stage a person triggers: their own local runner when one is online. Otherwise
 * the fake executor, which only exists against the emulator, like the sample GitHub client:
 * an emulated process talks to a `demo-*` project with no real user. No variable turns it
 * on, so it cannot run in production by mistake.
 */
export function resolveStageExecutorMode(input: {
    hasOnlineRunner: boolean;
}): StageExecutorKind | null {
    if (input.hasOnlineRunner) {
        return "local";
    }
    return isEmulated() ? "fake" : null;
}
