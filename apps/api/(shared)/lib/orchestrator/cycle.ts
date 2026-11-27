import {
    advanceCycle,
    type CreateCycleInput,
    type CycleAdvance,
    type CycleEvent,
    type CycleItemResult,
    type CycleState,
    type RunPerson,
    stageRunnersOf,
} from "@repo/kanban-contract";
import type { BoardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { isRunnerOnline } from "@/(shared)/lib/runner/runner-claim";
import type { CardRecord } from "@/(shared)/mappers/card.mapper";
import type {
    CycleItemRecord,
    CycleRecord,
} from "@/(shared)/mappers/cycle.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cycleRepository } from "@/(shared)/repositories/cycle.repository";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import type { OrchestratorRefusal } from "./decide";
import { chooseExecutorFor } from "./executor-choice";
import { stopRun, triggerStage } from "./orchestrator";

type Board = Pick<BoardDTO, "id" | "config" | "repository" | "stageSettings">;

export type CreateCycleOutcome =
    | OrchestratorRefusal
    | { ok: true; cycle: CycleRecord };

const MIN_RUNNERS_FOR_TWO = 2;

const refuse = (code: string, status: number): OrchestratorRefusal => ({
    ok: false,
    code,
    status,
});

/** A card a cycle may take: a ready spec in Tasks that nothing else is running. */
const isCycleCandidate = (card: CardRecord | undefined): card is CardRecord =>
    card !== undefined &&
    card.lane === "tasks" &&
    card.ready &&
    !card.orphan &&
    card.activeRunId === null &&
    card.cycleId === null;

async function onlineRunnerCount(userId: string, now: Date): Promise<number> {
    const runners = await runnerRepository.listByUser(userId);
    return runners.filter((runner) => isRunnerOnline(runner, now)).length;
}

/**
 * Checks what a cycle needs before storing it: the cards, an executor for the first stage
 * for whoever starts it, and two online runners for two specs at once. The test executor of
 * the emulator takes any number of runs, so it skips the runner count.
 */
async function checkCycle(
    board: Board,
    input: CreateCycleInput,
    by: RunPerson,
    now: Date
): Promise<OrchestratorRefusal | { ok: true; cards: CardRecord[] }> {
    const bySlug = new Map(
        (await cardRepository.listByBoard(board.id)).map((card) => [
            card.slug,
            card,
        ])
    );
    const cards = input.slugs.map((slug) => bySlug.get(slug));
    if (!cards.every(isCycleCandidate)) {
        return refuse("CYCLE_SPECS_INVALID", HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }
    const firstStage = board.config.stages[0]?.key;
    const choice = await chooseExecutorFor(
        by.userId,
        now,
        firstStage === undefined
            ? undefined
            : stageRunnersOf(board.config, firstStage)
    );
    if (!choice.ok) {
        return choice.refusal === "stage_not_served"
            ? refuse("RUN_NO_CREDENTIAL_FOR_STAGE", HTTP_STATUS.CONFLICT)
            : refuse(
                  "RUN_EXECUTOR_UNAVAILABLE",
                  HTTP_STATUS.SERVICE_UNAVAILABLE
              );
    }
    if (
        input.options.concurrency === MIN_RUNNERS_FOR_TWO &&
        choice.executor !== "fake" &&
        (await onlineRunnerCount(by.userId, now)) < MIN_RUNNERS_FOR_TWO
    ) {
        return refuse("CYCLE_RUNNERS_UNAVAILABLE", HTTP_STATUS.CONFLICT);
    }
    return { ok: true, cards };
}

const newItem = (card: CardRecord): CycleItemRecord => ({
    slug: card.slug,
    cardId: card.id,
    title: card.title,
    status: "pending",
    code: null,
    startedAt: null,
    endedAt: null,
});

export async function createCycle(input: {
    board: Board;
    input: CreateCycleInput;
    by: RunPerson;
    now: Date;
}): Promise<CreateCycleOutcome> {
    const { board, by, now } = input;
    const checked = await checkCycle(board, input.input, by, now);
    if (!checked.ok) {
        return checked;
    }
    const created = await cycleRepository.createOnBoard({
        cycle: {
            boardId: board.id,
            options: input.input.options,
            items: checked.cards.map(newItem),
            startedBy: by,
        },
        now,
    });
    if (!created.ok) {
        return created;
    }
    if (created.cycle.status === "running") {
        await advance(board, created.cycle.id, [], now);
    }
    const stored = await cycleRepository.findById(created.cycle.id);
    return { ok: true, cycle: stored ?? created.cycle };
}

/** Applies the events in order; the items each one starts add up. */
function advanceAll(
    cycle: CycleState<CycleItemRecord>,
    events: CycleEvent[],
    at: string
): CycleAdvance<CycleItemRecord> {
    let state = cycle;
    const start: string[] = [];
    let ended = false;
    for (const event of events.length === 0 ? [null] : events) {
        const advanced = advanceCycle(state, event, at);
        state = advanced.cycle;
        start.push(...advanced.start);
        ended ||= advanced.ended;
    }
    return { cycle: state, start, ended };
}

/**
 * Triggers the first stage of an item. Returns the refusal code (`null` when the trigger
 * threw) or `undefined` once the card runs: an item marked running without a run would hold
 * the cycle forever.
 */
async function startItem(
    board: Board,
    input: { cycleId: string; slug: string; by: RunPerson; now: Date }
): Promise<string | null | undefined> {
    try {
        const started = await triggerStage({
            board,
            slug: input.slug,
            stageKey: board.config.stages[0]?.key ?? "",
            by: input.by,
            trigger: "cycle",
            cycleId: input.cycleId,
            now: input.now,
        });
        if (started.ok) {
            return;
        }
        logEvent("orchestrator", "cycle_item_refused", {
            boardId: board.id,
            cycleId: input.cycleId,
            code: started.code,
        });
        return started.code;
    } catch (error) {
        logEvent("orchestrator", "cycle_item_trigger_failed", {
            boardId: board.id,
            cycleId: input.cycleId,
            name: error instanceof Error ? error.name : "unknown",
        });
        return null;
    }
}

/**
 * Records the events on the cycle and triggers the first stage of the items that fit now. A
 * trigger the orchestrator refuses fails that item and the cycle advances again; each item is
 * triggered once, so the loop ends.
 */
async function advance(
    board: Board,
    cycleId: string,
    events: CycleEvent[],
    now: Date
): Promise<void> {
    let pending = events;
    while (true) {
        const current = pending;
        const advanced = await cycleRepository.applyAdvance(
            cycleId,
            (cycle) => advanceAll(cycle, current, now.toISOString()),
            now
        );
        if (advanced === null) {
            return;
        }
        const failures: CycleEvent[] = [];
        for (const slug of advanced.start) {
            const code = await startItem(board, {
                cycleId,
                slug,
                by: advanced.cycle.startedBy,
                now,
            });
            if (code !== undefined) {
                failures.push({ slug, result: "failed", code });
            }
        }
        if (failures.length > 0) {
            pending = failures;
            continue;
        }
        if (advanced.ended) {
            await startNextQueued(board, now);
        }
        return;
    }
}

async function startNextQueued(board: Board, now: Date): Promise<boolean> {
    const nextId = await cycleRepository.startNextQueued(board.id, now);
    if (nextId === null) {
        return false;
    }
    await advance(board, nextId, [], now);
    return true;
}

/** A card left its cycle: `completeRun` and `stopRun` report how, and the cycle goes on. */
export async function onCycleItemSettled(
    board: Board,
    input: {
        cycleId: string;
        cardId: string;
        result: CycleItemResult;
        now: Date;
    }
): Promise<void> {
    const cycle = await cycleRepository.findById(input.cycleId);
    const item = cycle?.items.find(
        (candidate) => candidate.cardId === input.cardId
    );
    if (cycle === null || item === undefined) {
        return;
    }
    await advance(
        board,
        cycle.id,
        [{ slug: item.slug, result: input.result }],
        input.now
    );
}

export type StopCycleOutcome =
    | OrchestratorRefusal
    | { ok: true; cycle: CycleRecord };

/**
 * Stops the cycle and the live runs of its items. The items are closed on the cycle first,
 * so the stops that follow find nothing left to advance.
 */
export async function stopCycle(input: {
    board: Board;
    cycleId: string;
    by: RunPerson;
    now: Date;
}): Promise<StopCycleOutcome> {
    const { board, by, now } = input;
    const stopped = await cycleRepository.stop({
        boardId: board.id,
        cycleId: input.cycleId,
        by,
        now,
    });
    if (!stopped.ok) {
        return stopped;
    }
    const linked = (await cardRepository.listByBoard(board.id)).filter(
        (card) => card.cycleId === stopped.cycle.id
    );
    for (const card of linked) {
        if (card.activeRunId !== null) {
            await stopRun({ board, slug: card.slug, by, now });
        }
    }
    await cardRepository.detachCycle(
        linked.map((card) => card.id),
        stopped.cycle.id
    );
    if (stopped.wasRunning) {
        await startNextQueued(board, now);
    }
    const stored = await cycleRepository.findById(stopped.cycle.id);
    return { ok: true, cycle: stored ?? stopped.cycle };
}

/**
 * An item still `running` whose card no longer belongs to the cycle and runs nothing means
 * the process stopped between the end of the card's run and the cycle's advance, or between
 * the advance and the trigger. Reading the cycle closes it: from where the card stopped in
 * the first case, as a failure in the second. A running cycle with a free slot and pending
 * items stopped before its first advance, and reading it starts them.
 */
export async function reconcileCycle(
    board: Board,
    cycle: CycleRecord,
    cards: CardRecord[],
    now: Date
): Promise<boolean> {
    // A queued cycle waits for the end of the running one; if the process stopped right after
    // that end, nothing else would start it.
    if (cycle.status === "queued") {
        return await startNextQueued(board, now);
    }
    if (cycle.status !== "running") {
        return false;
    }
    const byId = new Map(cards.map((card) => [card.id, card]));
    const stale = cycle.items.flatMap((item): CycleEvent[] => {
        if (item.status !== "running") {
            return [];
        }
        const card = byId.get(item.cardId);
        if (card === undefined) {
            return startedLongAgo(item.startedAt, now)
                ? [{ slug: item.slug, result: "failed" }]
                : [];
        }
        if (card.cycleId === cycle.id || card.activeRunId !== null) {
            return [];
        }
        if (ranSince(card, item.startedAt)) {
            return [{ slug: item.slug, result: staleResult(card) }];
        }
        return startedLongAgo(item.startedAt, now)
            ? [{ slug: item.slug, result: "failed" }]
            : [];
    });
    if (stale.length === 0 && !hasIdleSlot(cycle)) {
        return false;
    }
    await advance(board, cycle.id, stale, now);
    return true;
}

/**
 * The advance that marks items running is the same write that takes their slot, so a free
 * slot next to a pending item only survives a process that stopped before that advance.
 */
function hasIdleSlot(cycle: CycleRecord): boolean {
    const running = cycle.items.filter(
        (item) => item.status === "running"
    ).length;
    return (
        cycle.items.some((item) => item.status === "pending") &&
        running < cycle.options.concurrency
    );
}

/**
 * Between the advance that marks an item running and the trigger that links its card there
 * are milliseconds; an item still unlinked after this long lost its trigger.
 */
const UNSTARTED_ITEM_GRACE_MS = 600_000;

function startedLongAgo(startedAt: string | null, now: Date): boolean {
    return (
        startedAt !== null &&
        now.getTime() - new Date(startedAt).getTime() > UNSTARTED_ITEM_GRACE_MS
    );
}

/** Before its first run ends the card has not joined the cycle yet, which is not stale. */
function ranSince(card: CardRecord, startedAt: string | null): boolean {
    const finishedAt = card.lastRun?.finishedAt ?? null;
    return startedAt !== null && finishedAt !== null && finishedAt >= startedAt;
}

function staleResult(card: CardRecord): CycleItemResult {
    if (card.state === "failed") {
        return "failed";
    }
    if (card.state === "waiting_input") {
        return "waiting_input";
    }
    return card.lastRun?.status === "stopped" ? "stopped" : "done";
}
