import {
    type ActiveRunView,
    canRunPrComment,
    type ExecutorReport,
    findPullRequestStage,
    type RunEndReason,
    type RunPerson,
    type RunTrigger,
    resolvePullRequestClosure,
    type StageOutcome,
    stageRunnersOf,
} from "@repo/kanban-contract";
import type { BoardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { agentEventFromTool } from "@/(shared)/lib/card-events";
import { nextTasksOrder } from "@/(shared)/lib/card-order";
import {
    appendBoardUpdate,
    pullRequestEventText,
} from "@/(shared)/lib/pull-request/pull-request-events";
import { ensurePullRequest } from "@/(shared)/lib/pull-request/pull-request-open";
import { findUnclaimed } from "@/(shared)/lib/runner/runner-claim";
import { type CardRecord, cardIdFor } from "@/(shared)/mappers/card.mapper";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { runRepository } from "@/(shared)/repositories/run.repository";
import {
    deadlineFor,
    findExpired,
    type OrchestratorRefusal,
    pickPromotions,
    planCompletion,
    planTrigger,
    toStageDispatch,
} from "./decide";
import { getStageExecutor } from "./executor";
import { chooseExecutorFor, executorsForRuns } from "./executor-choice";

type Board = Pick<BoardDTO, "id" | "config" | "repository" | "stageSettings">;

export type TriggerResult =
    | OrchestratorRefusal
    | { ok: true; card: CardRecord; run: RunRecord };

export type StopResult = OrchestratorRefusal | { ok: true; card: CardRecord };

async function readBack(
    cardId: string,
    runId: string
): Promise<{ card: CardRecord; run: RunRecord } | null> {
    const [card, run] = await Promise.all([
        cardRepository.findById(cardId),
        runRepository.findById(runId),
    ]);
    return card && run ? { card, run } : null;
}

/** Queues `stageKey` on the card and starts it right away when the column has a free slot. */
export async function triggerStage(input: {
    board: Board;
    slug: string;
    stageKey: string;
    by: RunPerson;
    trigger?: RunTrigger;
    now?: Date;
}): Promise<TriggerResult> {
    const now = input.now ?? new Date();
    const queued = await runRepository.enqueueOnCard(
        cardIdFor(input.board.id, input.slug),
        (card) =>
            planTrigger(card, {
                stageKey: input.stageKey,
                config: input.board.config,
                by: input.by,
                now,
                trigger: input.trigger,
            })
    );
    if (!queued.ok) {
        return queued;
    }
    if (input.trigger !== "pr_comment") {
        await openPullRequestOnEntry({
            board: input.board,
            cardId: queued.cardId,
            stageKey: input.stageKey,
            dispatchAs: input.by,
            now,
        });
    }
    await pumpBoard(input.board, now);
    const stored = await readBack(queued.cardId, queued.runId);
    return stored
        ? { ok: true, ...stored }
        : { ok: false, code: "CARD_NOT_FOUND", status: HTTP_STATUS.NOT_FOUND };
}

/**
 * Applies a stage result to the card. Every result goes through here, whoever reports it
 * (the agent, a timeout, a dispatch that failed), and a second call for the same run is
 * ignored.
 */
export async function completeRun(input: {
    board: Board;
    runId: string;
    outcome: StageOutcome;
    endReason: RunEndReason;
    now?: Date;
}): Promise<{ ignored: boolean }> {
    const now = input.now ?? new Date();
    const { board } = input;
    const result = await runRepository.finishOnCard({
        runId: input.runId,
        close: {
            status: "finished",
            outcome: input.outcome,
            endReason: input.endReason,
            stoppedBy: null,
        },
        config: board.config,
        plan: (card, run) =>
            planCompletion({
                card,
                run,
                outcome: input.outcome,
                config: board.config,
                stageSettings: board.stageSettings,
                now,
            }),
        now,
    });
    if (result.ignored) {
        return { ignored: true };
    }
    if (result.next !== null && result.next.trigger !== "pr_comment") {
        await openPullRequestOnEntry({
            board,
            cardId: result.cardId,
            stageKey: result.next.stageKey,
            dispatchAs: result.next.triggeredBy,
            now,
        });
    }
    await settlePullRequest(board, result.cardId);
    await pumpBoard(board, now);
    return { ignored: false };
}

/**
 * Opens the pull request before the stage command runs, so the command already finds it.
 * A failure stays on the card for a person to retry; it never fails the caller.
 */
async function openPullRequestOnEntry({
    board,
    cardId,
    stageKey,
    dispatchAs,
    now,
}: {
    board: Board;
    cardId: string;
    stageKey: string;
    dispatchAs: RunPerson;
    now: Date;
}): Promise<void> {
    if (findPullRequestStage(board.config)?.key !== stageKey) {
        return;
    }
    try {
        await ensurePullRequest({ board, cardId, dispatchAs, now });
    } catch {
        logEvent("github", "pull-request-open-crashed", {
            boardId: board.id,
            cardId,
        });
    }
}

/**
 * Moves a card whose pull request was merged (to Done) or closed (to the end of Tasks). With
 * a live run nothing moves: `completeRun` calls this again once that run ends.
 */
export async function settlePullRequest(
    board: Pick<Board, "id" | "config">,
    cardId: string
): Promise<void> {
    const card = await cardRepository.findById(cardId);
    if (card === null) {
        return;
    }
    const closure = resolvePullRequestClosure(
        card,
        findPullRequestStage(board.config)?.key
    );
    if (closure === null) {
        return;
    }
    const order =
        closure.lane === "tasks"
            ? nextTasksOrder(await cardRepository.listByBoard(board.id))
            : undefined;
    await cardRepository.move(card.id, {
        lane: closure.lane,
        order,
        movedByUserId: null,
    });
}

/**
 * A new comment or review on the card's pull request runs the comment command. With a run
 * still live, or the hourly limit reached, the comment is kept as waiting: the end of the
 * live run picks it up.
 */
export async function onPullRequestComment(
    board: Board,
    cardId: string,
    now: Date
): Promise<void> {
    const stage = findPullRequestStage(board.config);
    const limit = board.config.limits.maxPrCommentRunsPerHour;
    if (stage?.onPrComment === undefined || limit === 0) {
        return;
    }
    const card = await cardRepository.findById(cardId);
    const pullRequest = card?.pullRequest;
    if (
        card === null ||
        pullRequest == null ||
        pullRequest.state !== "open" ||
        card.lane !== "stage" ||
        card.stageKey !== stage.key
    ) {
        return;
    }
    const withinLimit = canRunPrComment(pullRequest.commentRunsAt, now, limit);
    if (withinLimit && card.activeRunId === null) {
        const started = await triggerStage({
            board,
            slug: card.slug,
            stageKey: stage.key,
            by: pullRequest.dispatchAs,
            trigger: "pr_comment",
            now,
        });
        if (started.ok || started.code !== "CARD_RUN_ACTIVE") {
            return;
        }
    }
    await cardRepository.updatePullRequest(card.id, (stored) =>
        stored.pullRequest?.state === "open"
            ? {
                  pullRequest: {
                      ...stored.pullRequest,
                      unhandledCommentAt: now.toISOString(),
                  },
              }
            : null
    );
    if (!withinLimit && pullRequest.unhandledCommentAt === null) {
        await appendBoardUpdate(
            card,
            pullRequestEventText.commentLimit(limit, stage.onPrComment)
        );
    }
}

export async function stopRun(input: {
    board: Board;
    slug: string;
    by: RunPerson;
    now?: Date;
}): Promise<StopResult> {
    const now = input.now ?? new Date();
    const stopped = await runRepository.stopOnCard(
        cardIdFor(input.board.id, input.slug),
        input.by,
        now
    );
    if (!stopped.ok) {
        return stopped;
    }
    const run = await runRepository.findById(stopped.runId);
    if (run?.executor) {
        await getStageExecutor(run.executor)?.cancel(stopped.runId);
    }
    await pumpBoard(input.board, now);
    const card = await cardRepository.findById(stopped.cardId);
    return card
        ? { ok: true, card }
        : { ok: false, code: "CARD_NOT_FOUND", status: HTTP_STATUS.NOT_FOUND };
}

/**
 * After a person answers a stage's questions, runs that stage again so the agent reads
 * the answers. A card that is not waiting, or a board without an executor, is left alone.
 */
export async function resumeAfterAnswer(input: {
    board: Board;
    slug: string;
    by: RunPerson;
    now?: Date;
}): Promise<void> {
    const card = await cardRepository.findBySlug(input.board.id, input.slug);
    if (
        card === null ||
        !(card.lane === "stage" || card.lane === "drafts") ||
        card.stageKey === null ||
        card.state !== "waiting_input" ||
        card.activeRunId !== null ||
        card.pendingAsk !== null
    ) {
        return;
    }
    const choice = await chooseExecutorFor(
        input.by.userId,
        input.now,
        stageRunnersOf(input.board.config, card.stageKey)
    );
    if (!choice.ok) {
        return;
    }
    await triggerStage({
        board: input.board,
        slug: input.slug,
        stageKey: card.stageKey,
        by: input.by,
        trigger: "answer",
        now: input.now,
    });
}

/**
 * Starts what fits in the columns. Each run gets the executor of the person who triggered
 * it, so a runner only ever runs its owner's stages. A run whose person has no executor
 * ends right away: `no_credential` when nothing they own can serve that stage, `no_runner`
 * when an online runner would.
 */
async function pumpBoard(board: Board, now: Date): Promise<void> {
    const live = await runRepository.listActiveByBoard(board.id);
    const queued = live.filter((run) => run.status === "queued");
    if (queued.length === 0) {
        return;
    }
    const choices = await executorsForRuns(queued, board.config, now);
    const started = await runRepository.promote({
        boardId: board.id,
        // A run queued after `live` was read has no choice yet; the pump of the request that
        // queued it read it, so it stays queued here instead of starting with no executor.
        pick: (runs, stored) =>
            pickPromotions(runs, stored.stageSettings).filter((run) =>
                choices.has(run.id)
            ),
        executorFor: (run) => {
            const choice = choices.get(run.id);
            return choice?.ok ? choice.executor : null;
        },
        deadlineFor: (startedAt, stored) =>
            deadlineFor(startedAt, stored.config),
        now,
    });
    for (const run of started) {
        const executor =
            run.executor === null ? null : getStageExecutor(run.executor);
        if (executor === null) {
            const choice = choices.get(run.id);
            const endReason =
                choice && !choice.ok && choice.refusal === "stage_not_served"
                    ? "no_credential"
                    : "no_runner";
            logEvent("orchestrator", endReason, {
                boardId: board.id,
                runId: run.id,
            });
            await completeRun({
                board,
                runId: run.id,
                outcome: "failed",
                endReason,
                now,
            });
            continue;
        }
        let dispatched = false;
        try {
            dispatched = (await executor.dispatch(toStageDispatch(run, board)))
                .ok;
        } catch {
            dispatched = false;
        }
        if (!dispatched) {
            logEvent("orchestrator", "dispatch_failed", {
                boardId: board.id,
                runId: run.id,
            });
            await completeRun({
                board,
                runId: run.id,
                outcome: "failed",
                endReason: "dispatch_failed",
                now,
            });
        }
    }
}

const toActiveRunView = (run: RunRecord): ActiveRunView => ({
    runId: run.id,
    cardId: run.cardId,
    slug: run.slug,
    stageKey: run.stageKey,
    command: run.command,
    startedAt: new Date(run.startedAt ?? run.queuedAt),
});

/** Writes what an executor reported on the timeline, the way an agent's tools would. */
async function recordReport(
    board: Board,
    run: RunRecord,
    report: ExecutorReport
): Promise<void> {
    const card = await cardRepository.findById(run.cardId);
    if (card === null) {
        return;
    }
    const ctx = { card, config: board.config };
    const ref = { cardId: run.cardId, stage: run.stageKey };
    const events = [
        ...(report.questions
            ? [
                  agentEventFromTool(
                      {
                          tool: "ask",
                          input: { ...ref, questions: report.questions },
                      },
                      ctx
                  ),
              ]
            : []),
        agentEventFromTool(
            {
                tool: "complete_stage",
                input: {
                    ...ref,
                    outcome: report.outcome,
                    summary: report.summary,
                },
            },
            ctx
        ),
    ];
    for (const event of events) {
        if (event.ok) {
            await cardEventRepository.appendAgentEvent(card, {
                ...event.write,
                runId: run.id,
            });
        }
    }
}

/**
 * What depends on the clock rather than on a request: runs past their deadline, and the
 * results an executor collects by itself. It runs at the start of every board read, which
 * stands in for a scheduler the free plans do not offer.
 */
export async function tick(board: Board, now = new Date()): Promise<void> {
    const runs = await runRepository.listActiveByBoard(board.id);
    if (runs.length === 0) {
        return;
    }
    const expired = findExpired(runs, now);
    for (const run of expired) {
        await completeRun({
            board,
            runId: run.id,
            outcome: "failed",
            endReason: "timeout",
            now,
        });
    }

    const expiredIds = new Set(expired.map((run) => run.id));
    for (const run of findUnclaimed(runs, now)) {
        if (expiredIds.has(run.id)) {
            continue;
        }
        expiredIds.add(run.id);
        await completeRun({
            board,
            runId: run.id,
            outcome: "failed",
            endReason: "no_runner",
            now,
        });
    }

    const fake = getStageExecutor("fake");
    const running = runs.filter(
        (run) =>
            run.status === "running" &&
            run.executor === "fake" &&
            !expiredIds.has(run.id)
    );
    if (fake?.collect && running.length > 0) {
        const byId = new Map(running.map((run) => [run.id, run]));
        const reports = await fake.collect(running.map(toActiveRunView), now);
        for (const report of reports) {
            const run = byId.get(report.runId);
            if (run === undefined) {
                continue;
            }
            await recordReport(board, run, report);
            await completeRun({
                board,
                runId: run.id,
                outcome: report.outcome,
                endReason: "agent",
                now,
            });
        }
    }

    if (runs.some((run) => run.status === "queued")) {
        await pumpBoard(board, now);
    }
}
