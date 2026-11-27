import { isEmulated } from "@repo/auth/emulator";
import {
    chooseStageExecutor,
    type RunnerKind,
    type StageExecutorChoice,
    type StageExecutorKind,
} from "@repo/kanban-contract";

const ANY_RUNNER: readonly RunnerKind[] = ["local", "cloud"];

/**
 * Who runs a stage a person triggers: their own local runner when one is online and the
 * stage accepts it. Otherwise the fake executor, which only exists against the emulator,
 * like the sample GitHub client: an emulated process talks to a `demo-*` project with no
 * real user. No variable turns it on, so it cannot run in production by mistake.
 */
export function chooseStageExecutorMode(input: {
    hasOnlineRunner: boolean;
    stageRunners?: readonly RunnerKind[];
}): StageExecutorChoice {
    return chooseStageExecutor({
        stageRunners: input.stageRunners ?? ANY_RUNNER,
        hasOnlineRunner: input.hasOnlineRunner,
        emulated: isEmulated(),
    });
}

/** The executor of a stage that accepts every runner, as the board views ask about it. */
export function resolveStageExecutorMode(input: {
    hasOnlineRunner: boolean;
}): StageExecutorKind | null {
    const choice = chooseStageExecutorMode(input);
    return choice.ok ? choice.executor : null;
}
