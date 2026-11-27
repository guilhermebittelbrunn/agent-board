import {
    RUN_END_REASONS,
    RUN_STATUSES,
    RUN_TRIGGERS,
    type RunEndReason,
    type RunPerson,
    type RunStatus,
    type RunTrigger,
    STAGE_EXECUTOR_KINDS,
    STAGE_OUTCOMES,
    type StageConfig,
    type StageExecutorKind,
    type StageOutcome,
} from "@repo/kanban-contract";
import type { RunDTO } from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import Mapper from "./Mapper";

export const RUN_TABLE = "run";

export type RunFirestoreRow = Record<string, unknown> & { id: string };

/** The stored run as the API sees it; `RunDTO` is what leaves the API. */
export type RunRecord = {
    id: string;
    boardId: string;
    cardId: string;
    slug: string;
    stageKey: string;
    command: string;
    agent: string | null;
    model: StageConfig["model"];
    effort: StageConfig["effort"];
    maxTurns: number;
    branch: string;
    trigger: RunTrigger;
    triggeredBy: RunPerson;
    /** The cycle the run belongs to, copied from the card when the run is queued. */
    cycleId: string | null;
    executor: StageExecutorKind | null;
    status: RunStatus;
    /** `true` while queued or running; equality on it is how a board finds its live runs. */
    active: boolean;
    outcome: StageOutcome | null;
    endReason: RunEndReason | null;
    stoppedBy: RunPerson | null;
    queuedAt: string;
    startedAt: string | null;
    deadlineAt: string | null;
    finishedAt: string | null;
    sessionUrl: string | null;
    turns: number | null;
    /** The local runner that claimed the run; heartbeat and finish check it. */
    runnerId: string | null;
    claimedAt: string | null;
    /** Set by the runner's finish, once, so a repeated finish writes nothing. */
    runnerFinishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

/** What a new run copies from the stage when it is queued: `board.yml` may change later. */
export type NewRun = Pick<
    RunRecord,
    | "boardId"
    | "cardId"
    | "slug"
    | "stageKey"
    | "command"
    | "agent"
    | "model"
    | "effort"
    | "maxTurns"
    | "branch"
    | "trigger"
    | "triggeredBy"
    | "cycleId"
>;

export function newRunDocument(run: NewRun, now: Date) {
    return {
        ...run,
        executor: null,
        status: "queued" satisfies RunStatus,
        active: true,
        outcome: null,
        endReason: null,
        stoppedBy: null,
        queuedAt: now,
        startedAt: null,
        deadlineAt: null,
        finishedAt: null,
        sessionUrl: null,
        turns: null,
        runnerId: null,
        claimedAt: null,
        runnerFinishedAt: null,
        tokenHash: null,
        tokenExpiresAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

const instantOrNull = (value: unknown): string | null =>
    value == null ? null : normalizeFirestoreInstant(value);

function oneOf<T extends string>(
    values: readonly T[],
    value: unknown,
    fallback: T
): T;
function oneOf<T extends string>(
    values: readonly T[],
    value: unknown,
    fallback: null
): T | null;
function oneOf<T extends string>(
    values: readonly T[],
    value: unknown,
    fallback: T | null
): T | null {
    return values.includes(value as T) ? (value as T) : fallback;
}

export function toRunPerson(value: unknown): RunPerson | null {
    const person = asRecord(value);
    const userId = textOrNull(person.userId);
    if (userId === null) {
        return null;
    }
    return { userId, login: String(person.login ?? "") };
}

class RunMapper extends Mapper<RunFirestoreRow, RunRecord> {
    toDTO(row: RunFirestoreRow): RunRecord {
        const { id, ...record } = row;
        const status = oneOf(RUN_STATUSES, record.status, "finished");
        return {
            id,
            boardId: String(record.boardId ?? ""),
            cardId: String(record.cardId ?? ""),
            slug: String(record.slug ?? ""),
            stageKey: String(record.stageKey ?? ""),
            command: String(record.command ?? ""),
            agent: textOrNull(record.agent),
            model: record.model as StageConfig["model"],
            effort: record.effort as StageConfig["effort"],
            maxTurns: typeof record.maxTurns === "number" ? record.maxTurns : 0,
            branch: String(record.branch ?? ""),
            trigger: oneOf(RUN_TRIGGERS, record.trigger, "drag"),
            triggeredBy: toRunPerson(record.triggeredBy) ?? {
                userId: "",
                login: "",
            },
            cycleId: textOrNull(record.cycleId),
            executor: oneOf(STAGE_EXECUTOR_KINDS, record.executor, null),
            status,
            active: record.active === true,
            outcome: oneOf(STAGE_OUTCOMES, record.outcome, null),
            endReason: oneOf(RUN_END_REASONS, record.endReason, null),
            stoppedBy: toRunPerson(record.stoppedBy),
            queuedAt: normalizeFirestoreInstant(record.queuedAt),
            startedAt: instantOrNull(record.startedAt),
            deadlineAt: instantOrNull(record.deadlineAt),
            finishedAt: instantOrNull(record.finishedAt),
            sessionUrl: textOrNull(record.sessionUrl),
            turns: typeof record.turns === "number" ? record.turns : null,
            runnerId: textOrNull(record.runnerId),
            claimedAt: instantOrNull(record.claimedAt),
            runnerFinishedAt: instantOrNull(record.runnerFinishedAt),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt: instantOrNull(record.deletedAt),
        };
    }

    /** Runs are written whole by the orchestrator's transactions, never patched through here. */
    toPersistence(
        input: AllOptional<RunRecord> | Record<string, unknown>
    ): AllOptional<Record<string, unknown>> {
        const { id: _id, ...rest } = input as Record<string, unknown>;
        return rest as AllOptional<Record<string, unknown>>;
    }
}

export const runMapper = new RunMapper();

/**
 * The agent token of a run, read apart from `RunRecord` so the hash never travels with the
 * run through the orchestrator or into `RunDTO`.
 */
export type RunTokenState = {
    tokenHash: string | null;
    tokenExpiresAt: string | null;
};

export function toRunTokenState(row: Record<string, unknown>): RunTokenState {
    return {
        tokenHash: textOrNull(row.tokenHash),
        tokenExpiresAt: instantOrNull(row.tokenExpiresAt),
    };
}

export function toRunDTO(run: RunRecord): RunDTO {
    return {
        id: run.id,
        boardId: run.boardId,
        cardId: run.cardId,
        stageKey: run.stageKey,
        command: run.command,
        model: run.model,
        effort: run.effort,
        maxTurns: run.maxTurns,
        branch: run.branch,
        trigger: run.trigger,
        triggeredByLogin: run.triggeredBy.login,
        cycleId: run.cycleId,
        executor: run.executor,
        status: run.status,
        outcome: run.outcome,
        endReason: run.endReason,
        queuedAt: run.queuedAt,
        startedAt: run.startedAt,
        deadlineAt: run.deadlineAt,
        finishedAt: run.finishedAt,
    };
}
