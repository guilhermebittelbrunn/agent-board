import type { BoardConfig, StageConfig } from "./boardConfig";

export const CARD_STATES = [
    "idle",
    "queued",
    "running",
    "waiting_input",
    "failed",
] as const;
export type CardState = (typeof CARD_STATES)[number];

export const STAGE_OUTCOMES = [
    "success",
    "needs_input",
    "needs_rework",
    "failed",
] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

export type CardPosition = {
    stageKey: string | null;
    state: CardState;
    reworkLoops: number;
};

export type TransitionInput = {
    config: BoardConfig;
    current: CardPosition & { stageKey: string };
    outcome: StageOutcome;
    approvalGateEnabled: boolean;
};

function findStage(config: BoardConfig, key: string): StageConfig {
    const stage = config.stages.find((candidate) => candidate.key === key);
    if (stage === undefined) {
        throw new Error(`Unknown stage "${key}"`);
    }
    return stage;
}

function nextStageKey(config: BoardConfig, key: string): string | null {
    const index = config.stages.findIndex((stage) => stage.key === key);
    return config.stages[index + 1]?.key ?? null;
}

function requiresApproval(stage: StageConfig, gateEnabled: boolean): boolean {
    if (stage.approval === "required") {
        return true;
    }
    return stage.approval === "optional" && gateEnabled;
}

export function resolveTransition(input: TransitionInput): CardPosition {
    const { config, current, outcome, approvalGateEnabled } = input;
    const stage = findStage(config, current.stageKey);

    if (outcome === "needs_input") {
        return { ...current, state: "waiting_input" };
    }

    if (outcome === "failed") {
        return { ...current, state: "failed" };
    }

    if (outcome === "needs_rework") {
        const canLoop =
            stage.onRework !== undefined &&
            current.reworkLoops < config.limits.maxReworkLoops;
        if (!(canLoop && stage.onRework)) {
            return { ...current, state: "waiting_input" };
        }
        return {
            stageKey: stage.onRework,
            state: "queued",
            reworkLoops: current.reworkLoops + 1,
        };
    }

    // The pull request stage ends with the merge, not with its command: the card waits there.
    if (stage.pullRequest !== undefined) {
        return { ...current, state: "idle" };
    }

    const next = nextStageKey(config, current.stageKey);
    if (next === null) {
        return {
            stageKey: null,
            state: "idle",
            reworkLoops: current.reworkLoops,
        };
    }
    return {
        stageKey: next,
        state: requiresApproval(stage, approvalGateEnabled) ? "idle" : "queued",
        reworkLoops: current.reworkLoops,
    };
}
