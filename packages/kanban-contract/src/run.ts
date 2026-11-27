import type { Question, StageDecision } from "./agentContract";
import type { BoardConfig } from "./boardConfig";
import type { CardLane } from "./boardLanes";
import type { CardPendingAsk } from "./cardEvent";
import type { CardState, StageOutcome } from "./cardState";

export const RUN_STATUSES = [
    "queued",
    "running",
    "finished",
    "stopped",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_END_REASONS = [
    "agent",
    "timeout",
    "dispatch_failed",
    "stopped",
    "no_runner",
    "no_credential",
] as const;
export type RunEndReason = (typeof RUN_END_REASONS)[number];

export const RUN_TRIGGERS = [
    "drag",
    "rerun",
    "approve",
    "answer",
    "transition",
    "pr_comment",
    "cycle",
] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const STAGE_EXECUTOR_KINDS = ["fake", "local"] as const;
export type StageExecutorKind = (typeof STAGE_EXECUTOR_KINDS)[number];

export type RunPerson = { userId: string; login: string };

/** The last run of a card, kept on the card so the board explains its state without reading runs. */
export type CardLastRun = {
    id: string;
    stageKey: string;
    status: RunStatus;
    outcome: StageOutcome | null;
    endReason: RunEndReason | null;
    stoppedByLogin: string | null;
    finishedAt: string | null;
};

type StageSettings = BoardConfig["stages"][number];

/**
 * What an executor receives to run a stage. Only the expected fields: the spec, comments
 * and answers stay on the card, where the agent reads them as data.
 */
export type StageDispatch = {
    runId: string;
    boardId: string;
    cardId: string;
    slug: string;
    stageKey: string;
    command: string;
    agent: string | null;
    model: StageSettings["model"];
    effort: StageSettings["effort"];
    maxTurns: number;
    branch: string;
    repository: { owner: string; name: string };
    triggeredBy: RunPerson;
    /** The cycle the run belongs to; the agent then decides on its own instead of asking. */
    cycleId: string | null;
};

export type ActiveRunView = {
    runId: string;
    cardId: string;
    slug: string;
    stageKey: string;
    command: string;
    cycleId: string | null;
    startedAt: Date;
};

export type ExecutorReport = {
    runId: string;
    outcome: StageOutcome;
    summary: string;
    questions?: Question[];
    decisions?: StageDecision[];
};

export type StageDispatchResult =
    | { ok: true; sessionUrl: string | null }
    | { ok: false; reason: string };

export type StageExecutor = {
    kind: StageExecutorKind;
    dispatch(input: StageDispatch): Promise<StageDispatchResult>;
    cancel(runId: string): Promise<void>;
    /** Results the executor learned on its own; an executor whose agent reports back does not need it. */
    collect?(runs: ActiveRunView[], now: Date): Promise<ExecutorReport[]>;
};

export type CardRunActions = {
    rerun: boolean;
    stop: boolean;
    approve: boolean;
};

export type CardRunActionsInput = {
    lane: CardLane;
    stageKey: string | null;
    state: CardState;
    activeRunId: string | null;
    pendingAsk: CardPendingAsk | null;
    lastRun: CardLastRun | null;
};

const NO_ACTIONS: CardRunActions = {
    rerun: false,
    stop: false,
    approve: false,
};

/** The stage before this one finished and the board asks a person before going on. */
export function isAwaitingApproval(card: CardRunActionsInput): boolean {
    return (
        card.lane === "stage" &&
        card.stageKey !== null &&
        card.activeRunId === null &&
        card.state === "idle" &&
        card.lastRun?.status === "finished" &&
        card.lastRun.outcome === "success" &&
        card.lastRun.stageKey !== card.stageKey
    );
}

function canRunAgain(card: CardRunActionsInput): boolean {
    if (card.state === "failed") {
        return true;
    }
    if (card.state === "waiting_input") {
        return card.pendingAsk === null;
    }
    if (card.state !== "idle") {
        return false;
    }
    return card.lastRun === null || card.lastRun.status === "stopped";
}

/**
 * The run buttons a card offers. The API repeats every check before acting; this only
 * decides what the screen shows.
 */
export function cardRunActions(
    card: CardRunActionsInput,
    options: { canTrigger: boolean; executorAvailable: boolean }
): CardRunActions {
    if (!(options.canTrigger && options.executorAvailable)) {
        return NO_ACTIONS;
    }
    if (card.activeRunId !== null) {
        return { rerun: false, stop: true, approve: false };
    }
    const runsStages = card.lane === "stage" || card.lane === "drafts";
    if (!runsStages || card.stageKey === null) {
        return NO_ACTIONS;
    }
    const approve = isAwaitingApproval(card);
    return { rerun: !approve && canRunAgain(card), stop: false, approve };
}
