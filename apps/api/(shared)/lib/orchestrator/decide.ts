import {
    type BoardConfig,
    type CardLane,
    type CardLastRun,
    type CardPullRequest,
    type CardState,
    canRunPrComment,
    findStageConfig,
    isAwaitingApproval,
    pruneCommentRuns,
    type RunEndReason,
    type RunPerson,
    type RunTrigger,
    resolveBranchName,
    resolveTransition,
    SPEC_STAGE_KEY,
    type StageConfig,
    type StageDispatch,
    type StageOutcome,
} from "@repo/kanban-contract";
import type { BoardDTO, BoardStageSettingsDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    type CardRecord,
    pullRequestDocument,
} from "@/(shared)/mappers/card.mapper";
import type { NewRun, RunRecord } from "@/(shared)/mappers/run.mapper";

export type OrchestratorRefusal = { ok: false; code: string; status: number };

const refuse = (code: string, status: number): OrchestratorRefusal => ({
    ok: false,
    code,
    status,
});

export type TriggerDecision =
    | OrchestratorRefusal
    | {
          ok: true;
          stage: StageConfig;
          branch: string;
          trigger: RunTrigger;
          resetReworkLoops: boolean;
      };

function branchOf(card: CardRecord, config: BoardConfig): string | null {
    if (card.branch !== null) {
        return card.branch;
    }
    try {
        return resolveBranchName(config, card.slug);
    } catch {
        return null;
    }
}

/**
 * Whether a person may start `stageKey` on this card, and what kind of start it is. The
 * kind is decided here, never taken from the request: entering a stage from elsewhere is a
 * drag, the same stage while the board waits for approval is an approval, and anything else
 * on the same stage runs it again.
 */
export function decideTrigger(
    card: CardRecord,
    stageKey: string,
    config: BoardConfig
): TriggerDecision {
    const stage = findStageConfig(config, stageKey);
    if (stage === undefined) {
        return refuse("CARD_STAGE_NOT_FOUND", HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }
    // The spec stage only runs on a draft, and a draft only leaves Drafts by approval.
    const isSpecStage = stage.key === SPEC_STAGE_KEY;
    if (isSpecStage !== (card.lane === "drafts")) {
        return isSpecStage
            ? refuse("CARD_STAGE_NOT_FOUND", HTTP_STATUS.UNPROCESSABLE_ENTITY)
            : refuse("CARD_DRAFT_NOT_APPROVED", HTTP_STATUS.CONFLICT);
    }
    if (card.lane === "tasks" && !card.ready) {
        return refuse("CARD_NOT_READY", HTTP_STATUS.CONFLICT);
    }
    const branch = branchOf(card, config);
    if (branch === null) {
        return refuse("CARD_BRANCH_INVALID", HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    const inStageLane = card.lane === "stage" || card.lane === "drafts";
    const sameStage = inStageLane && card.stageKey === stageKey;
    let trigger: RunTrigger = "drag";
    if (sameStage) {
        trigger = isAwaitingApproval(card) ? "approve" : "rerun";
    }
    return {
        ok: true,
        stage,
        branch,
        trigger,
        resetReworkLoops: !inStageLane,
    };
}

/**
 * `command` replaces the stage command, as the pull request comment command does; the
 * `board.yml` names no agent for it, so the run has none either.
 */
export function newRunFor(input: {
    card: Pick<CardRecord, "id" | "boardId" | "slug">;
    stage: StageConfig;
    config: BoardConfig;
    branch: string;
    trigger: RunTrigger;
    by: RunPerson;
    command?: string;
}): NewRun {
    const { card, stage } = input;
    return {
        boardId: card.boardId,
        cardId: card.id,
        slug: card.slug,
        stageKey: stage.key,
        command: input.command ?? stage.command,
        agent: input.command === undefined ? (stage.agent ?? null) : null,
        model: stage.model,
        effort: stage.effort,
        maxTurns: input.config.limits.maxTurnsPerStage,
        branch: input.branch,
        trigger: input.trigger,
        triggeredBy: input.by,
    };
}

export type TriggerPlan =
    | OrchestratorRefusal
    | { ok: true; run: NewRun; card: Record<string, unknown> };

/**
 * What the trigger transaction writes, decided on the card it read. Questions still open
 * from an earlier run are dropped: the new run supersedes them, the way a new `ask` does,
 * and they stay on the timeline unanswered.
 */
export function planTrigger(
    card: CardRecord | null,
    input: {
        stageKey: string;
        config: BoardConfig;
        by: RunPerson;
        now: Date;
        trigger?: RunTrigger;
    }
): TriggerPlan {
    if (card === null) {
        return refuse("CARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }
    if (card.activeRunId !== null) {
        return refuse("CARD_RUN_ACTIVE", HTTP_STATUS.CONFLICT);
    }
    const decision = decideTrigger(card, input.stageKey, input.config);
    if (!decision.ok) {
        return decision;
    }
    const comment =
        input.trigger === "pr_comment"
            ? planPrCommentRun(card, decision.stage, input.now)
            : null;
    if (input.trigger === "pr_comment" && comment === null) {
        return refuse("CARD_NOT_IN_PULL_REQUEST_STAGE", HTTP_STATUS.CONFLICT);
    }
    return {
        ok: true,
        run: newRunFor({
            card,
            stage: decision.stage,
            config: input.config,
            branch: decision.branch,
            trigger: input.trigger ?? decision.trigger,
            by: input.by,
            command: comment?.command,
        }),
        card: {
            lane: decision.stage.key === SPEC_STAGE_KEY ? "drafts" : "stage",
            stageKey: decision.stage.key,
            state: "queued",
            branch: decision.branch,
            pendingAsk: null,
            movedAt: input.now,
            movedByUserId: input.by.userId,
            updatedAt: input.now,
            ...(decision.resetReworkLoops ? { reworkLoops: 0 } : {}),
            ...(comment === null
                ? {}
                : { pullRequest: pullRequestDocument(comment.pullRequest) }),
        },
    };
}

/** The pull request after one more comment run starts now: counted, nothing left waiting. */
function countCommentRun(
    pullRequest: CardPullRequest,
    now: Date
): CardPullRequest {
    return {
        ...pullRequest,
        commentRunsAt: [
            ...pruneCommentRuns(pullRequest.commentRunsAt, now),
            now.toISOString(),
        ],
        unhandledCommentAt: null,
    };
}

/**
 * The comment command only runs on the card's own stage while its pull request is open;
 * the hourly limit is checked by the caller, before it decides to run instead of waiting.
 */
function planPrCommentRun(
    card: CardRecord,
    stage: StageConfig,
    now: Date
): { command: string; pullRequest: CardPullRequest } | null {
    if (
        stage.pullRequest === undefined ||
        stage.onPrComment === undefined ||
        card.lane !== "stage" ||
        card.stageKey !== stage.key ||
        card.pullRequest?.state !== "open"
    ) {
        return null;
    }
    return {
        command: stage.onPrComment,
        pullRequest: countCommentRun(card.pullRequest, now),
    };
}

/**
 * A comment that arrived while a run of the pull request stage was live is answered when
 * that run ends, if the hourly limit still allows it.
 */
function prCommentFollowUp(
    card: Pick<CardRecord, "pullRequest">,
    stage: StageConfig,
    config: BoardConfig,
    now: Date
): { command: string; pullRequest: CardPullRequest } | null {
    const { pullRequest } = card;
    if (
        stage.pullRequest === undefined ||
        stage.onPrComment === undefined ||
        pullRequest === null ||
        pullRequest.state !== "open" ||
        pullRequest.unhandledCommentAt === null ||
        !canRunPrComment(
            pullRequest.commentRunsAt,
            now,
            config.limits.maxPrCommentRunsPerHour
        )
    ) {
        return null;
    }
    return {
        command: stage.onPrComment,
        pullRequest: countCommentRun(pullRequest, now),
    };
}

export type CompletionPlan = {
    card: {
        lane: CardLane;
        stageKey: string | null;
        state: CardState;
        reworkLoops: number;
        pullRequest?: CardPullRequest;
    };
    next: {
        stage: StageConfig;
        trigger: "transition" | "pr_comment";
        command?: string;
    } | null;
};

/**
 * A spec draft never moves on its own: it waits for a person to answer or approve. A rework
 * has no earlier stage to go back to, so it stops the draft like a failure, until run again.
 */
function specDraftStateAfter(outcome: StageOutcome): CardState {
    if (outcome === "success") {
        return "idle";
    }
    return outcome === "needs_input" ? "waiting_input" : "failed";
}

/**
 * Where a stage result takes the card. This is the only caller of `resolveTransition` in
 * the API: an agent's report, a timeout and a failed dispatch all come through here.
 */
export function planCompletion(input: {
    card: Pick<CardRecord, "state" | "reworkLoops" | "pullRequest">;
    run: Pick<RunRecord, "stageKey">;
    outcome: StageOutcome;
    config: BoardConfig;
    stageSettings: BoardStageSettingsDTO;
    now: Date;
}): CompletionPlan {
    const { card, run, config } = input;
    if (run.stageKey === SPEC_STAGE_KEY) {
        return {
            card: {
                lane: "drafts",
                stageKey: SPEC_STAGE_KEY,
                state: specDraftStateAfter(input.outcome),
                reworkLoops: card.reworkLoops,
            },
            next: null,
        };
    }
    const known = config.stages.some((stage) => stage.key === run.stageKey);
    if (!known) {
        return {
            card: {
                lane: "stage",
                stageKey: run.stageKey,
                state: "failed",
                reworkLoops: card.reworkLoops,
            },
            next: null,
        };
    }

    const position = resolveTransition({
        config,
        current: {
            stageKey: run.stageKey,
            state: card.state,
            reworkLoops: card.reworkLoops,
        },
        outcome: input.outcome,
        approvalGateEnabled:
            input.stageSettings[run.stageKey]?.approvalGate ?? false,
    });

    const ranStage = config.stages.find((stage) => stage.key === run.stageKey);
    const settled =
        position.stageKey === run.stageKey &&
        (position.state === "idle" || position.state === "failed");
    const followUp =
        settled && ranStage !== undefined
            ? prCommentFollowUp(card, ranStage, config, input.now)
            : null;
    if (followUp !== null && ranStage !== undefined) {
        return {
            card: {
                lane: "stage",
                stageKey: run.stageKey,
                state: "queued",
                reworkLoops: position.reworkLoops,
                pullRequest: followUp.pullRequest,
            },
            next: {
                stage: ranStage,
                trigger: "pr_comment",
                command: followUp.command,
            },
        };
    }

    if (position.stageKey === null) {
        return {
            card: {
                lane: "done",
                stageKey: null,
                state: "idle",
                reworkLoops: position.reworkLoops,
            },
            next: null,
        };
    }
    const nextStage =
        position.state === "queued"
            ? config.stages.find((stage) => stage.key === position.stageKey)
            : undefined;
    return {
        card: {
            lane: "stage",
            stageKey: position.stageKey,
            state: position.state,
            reworkLoops: position.reworkLoops,
        },
        next:
            nextStage === undefined
                ? null
                : { stage: nextStage, trigger: "transition" },
    };
}

export type RunClose = {
    status: "finished" | "stopped";
    outcome: StageOutcome | null;
    endReason: RunEndReason;
    stoppedBy: RunPerson | null;
};

export function lastRunOf(
    run: Pick<RunRecord, "id" | "stageKey">,
    close: RunClose,
    finishedAt: Date
): Omit<CardLastRun, "finishedAt"> & { finishedAt: Date } {
    return {
        id: run.id,
        stageKey: run.stageKey,
        status: close.status,
        outcome: close.outcome,
        endReason: close.endReason,
        stoppedByLogin: close.stoppedBy?.login ?? null,
        finishedAt,
    };
}

const byQueueOrder = (left: RunRecord, right: RunRecord): number =>
    left.queuedAt.localeCompare(right.queuedAt) ||
    left.id.localeCompare(right.id);

/**
 * The queued runs that may start now. The limit of a stage counts running cards only, so a
 * queued card already sits in its column and starts as soon as a slot frees up.
 */
export function pickPromotions(
    runs: RunRecord[],
    stageSettings: BoardStageSettingsDTO
): RunRecord[] {
    const live = runs.filter((run) => run.active);
    const promoted: RunRecord[] = [];
    const stageKeys = new Set(live.map((run) => run.stageKey));
    for (const stageKey of stageKeys) {
        const inStage = live.filter((run) => run.stageKey === stageKey);
        const running = inStage.filter((run) => run.status === "running");
        const queued = inStage
            .filter((run) => run.status === "queued")
            .sort(byQueueOrder);
        const limit = stageSettings[stageKey]?.wipLimit ?? null;
        const slots =
            limit === null
                ? queued.length
                : Math.max(0, limit - running.length);
        promoted.push(...queued.slice(0, slots));
    }
    return promoted.sort(byQueueOrder);
}

export function findExpired(runs: RunRecord[], now: Date): RunRecord[] {
    return runs.filter(
        (run) =>
            run.active &&
            run.status === "running" &&
            run.deadlineAt !== null &&
            Date.parse(run.deadlineAt) <= now.getTime()
    );
}

export function deadlineFor(startedAt: Date, config: BoardConfig): Date {
    const MS_PER_MINUTE = 60_000;
    return new Date(
        startedAt.getTime() + config.limits.stageTimeoutMinutes * MS_PER_MINUTE
    );
}

export function toStageDispatch(
    run: RunRecord,
    board: Pick<BoardDTO, "repository">
): StageDispatch {
    return {
        runId: run.id,
        boardId: run.boardId,
        cardId: run.cardId,
        slug: run.slug,
        stageKey: run.stageKey,
        command: run.command,
        agent: run.agent,
        model: run.model,
        effort: run.effort,
        maxTurns: run.maxTurns,
        branch: run.branch,
        repository: {
            owner: board.repository.owner,
            name: board.repository.name,
        },
        triggeredBy: run.triggeredBy,
    };
}
