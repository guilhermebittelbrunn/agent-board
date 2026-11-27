import type {
    RunPerson,
    RunTrigger,
    StageExecutorKind,
} from "@repo/kanban-contract";
import type { BoardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import {
    type CompletionPlan,
    lastRunOf,
    newRunFor,
    type OrchestratorRefusal,
    type RunClose,
    type TriggerPlan,
} from "@/(shared)/lib/orchestrator/decide";
import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import db from "../infra/database";
import { boardMapper } from "../mappers/board.mapper";
import {
    CARD_TABLE,
    type CardRecord,
    cardMapper,
    pullRequestDocument,
} from "../mappers/card.mapper";
import {
    newRunDocument,
    RUN_TABLE,
    type RunRecord,
    type RunTokenState,
    runMapper,
    toRunTokenState,
} from "../mappers/run.mapper";
import { BaseRepository } from "./base.repository";

export type EnqueueResult =
    | OrchestratorRefusal
    | { ok: true; cardId: string; runId: string };

/** The run the completion queued, so the caller acts on it without reading it back. */
export type FinishedNextRun = {
    id: string;
    stageKey: string;
    trigger: RunTrigger;
    triggeredBy: RunPerson;
};

export type FinishResult =
    | { ignored: true }
    | {
          ignored: false;
          cardId: string;
          nextRunId: string | null;
          next: FinishedNextRun | null;
      };

export type SetTokenResult = { ok: true; expiresAt: string } | { ok: false };

export type RunWithToken = { run: RunRecord; token: RunTokenState };

export type StopResult =
    | OrchestratorRefusal
    | { ok: true; cardId: string; runId: string };

const BOARD_TABLE = "board";

const pullRequestPatch = (
    pullRequest: CompletionPlan["card"]["pullRequest"]
): Record<string, unknown> =>
    pullRequest === undefined
        ? {}
        : { pullRequest: pullRequestDocument(pullRequest) };

function finishedNextRun(
    next: CompletionPlan["next"],
    nextRunId: string | null,
    run: RunRecord
): FinishedNextRun | null {
    if (next === null || nextRunId === null) {
        return null;
    }
    return {
        id: nextRunId,
        stageKey: next.stage.key,
        trigger: next.trigger,
        triggeredBy: run.triggeredBy,
    };
}

function liveCard(snapshot: DocumentSnapshot): CardRecord | null {
    const data = snapshot.data();
    if (!(snapshot.exists && data) || data.deletedAt != null) {
        return null;
    }
    return cardMapper.toDTO({ id: snapshot.id, ...data });
}

/**
 * Every write that changes a card's run goes through a transaction here, so two people
 * dragging the same card, or a result arriving twice, cannot both win.
 */
class RunRepository extends BaseRepository<RunRecord> {
    constructor() {
        super(db, RUN_TABLE, runMapper);
    }

    private cardRef(cardId: string) {
        return this.db.collection(CARD_TABLE).doc(cardId);
    }

    /** Only equality filters, so no composite index; a board has tens of live runs at most. */
    async listActiveByBoard(boardId: string): Promise<RunRecord[]> {
        const snapshot = await this.db
            .collection(this.table)
            .where("boardId", "==", boardId)
            .where("active", "==", true)
            .get();
        return snapshot.docs.map((docSnap) =>
            this.toDTO(docSnap.id, docSnap.data() as Record<string, unknown>)
        );
    }

    async findWithToken(runId: string): Promise<RunWithToken | null> {
        if (!isUsableDocumentId(runId)) {
            return null;
        }
        const snapshot = await this.db.collection(this.table).doc(runId).get();
        const data = snapshot.data();
        if (!(snapshot.exists && data) || data.deletedAt != null) {
            return null;
        }
        return {
            run: this.toDTO(snapshot.id, data),
            token: toRunTokenState(data),
        };
    }

    /**
     * Stores the hash of a new agent token on a running run, expiring with its deadline.
     * A run that is queued, closed or without a deadline gets no token.
     */
    async setToken(runId: string, tokenHash: string): Promise<SetTokenResult> {
        if (!isUsableDocumentId(runId)) {
            return { ok: false };
        }
        const runRef = this.db.collection(this.table).doc(runId);
        return await this.db.runTransaction(
            async (transaction): Promise<SetTokenResult> => {
                const snapshot = await transaction.get(runRef);
                const data = snapshot.data();
                if (!(snapshot.exists && data) || data.deletedAt != null) {
                    return { ok: false };
                }
                const run = this.toDTO(snapshot.id, data);
                if (
                    !run.active ||
                    run.status !== "running" ||
                    run.deadlineAt === null
                ) {
                    return { ok: false };
                }
                const expiresAt = new Date(run.deadlineAt);
                transaction.update(runRef, {
                    tokenHash,
                    tokenExpiresAt: expiresAt,
                    updatedAt: new Date(),
                });
                return { ok: true, expiresAt: run.deadlineAt };
            }
        );
    }

    async enqueueOnCard(
        cardId: string,
        plan: (card: CardRecord | null) => TriggerPlan
    ): Promise<EnqueueResult> {
        if (!isUsableDocumentId(cardId)) {
            return {
                ok: false,
                code: "CARD_NOT_FOUND",
                status: HTTP_STATUS.NOT_FOUND,
            };
        }
        const cardRef = this.cardRef(cardId);
        const runRef = this.db.collection(this.table).doc();
        return await this.db.runTransaction(
            async (transaction): Promise<EnqueueResult> => {
                const decided = plan(liveCard(await transaction.get(cardRef)));
                if (!decided.ok) {
                    return decided;
                }
                const now = decided.card.updatedAt as Date;
                transaction.set(runRef, newRunDocument(decided.run, now));
                transaction.update(cardRef, {
                    ...decided.card,
                    activeRunId: runRef.id,
                });
                return { ok: true, cardId, runId: runRef.id };
            }
        );
    }

    /**
     * Closes a live run and moves its card as `plan` decides, creating the next run when the
     * card goes on to another stage. A run that is no longer live is left alone, which is
     * what makes a repeated result harmless.
     */
    async finishOnCard(input: {
        runId: string;
        close: RunClose;
        plan: (card: CardRecord, run: RunRecord) => CompletionPlan;
        config: BoardDTO["config"];
        now: Date;
    }): Promise<FinishResult> {
        if (!isUsableDocumentId(input.runId)) {
            return { ignored: true };
        }
        const { now, close } = input;
        const runRef = this.db.collection(this.table).doc(input.runId);
        const nextRef = this.db.collection(this.table).doc();
        return await this.db.runTransaction(
            async (transaction): Promise<FinishResult> => {
                const runSnap = await transaction.get(runRef);
                const runData = runSnap.data();
                if (!(runSnap.exists && runData && runData.active === true)) {
                    return { ignored: true };
                }
                const run = this.toDTO(runSnap.id, runData);
                const cardRef = this.cardRef(run.cardId);
                const card = liveCard(await transaction.get(cardRef));

                transaction.update(runRef, {
                    ...close,
                    active: false,
                    finishedAt: now,
                    updatedAt: now,
                });
                if (card === null || card.activeRunId !== run.id) {
                    return {
                        ignored: false,
                        cardId: run.cardId,
                        nextRunId: null,
                        next: null,
                    };
                }

                const planned = input.plan(card, run);
                const { pullRequest, ...position } = planned.card;
                const plan = { ...planned, card: position };
                let nextRunId: string | null = null;
                if (plan.next !== null) {
                    transaction.set(
                        nextRef,
                        newRunDocument(
                            newRunFor({
                                card,
                                stage: plan.next.stage,
                                config: input.config,
                                branch: run.branch,
                                trigger: plan.next.trigger,
                                by: run.triggeredBy,
                                command: plan.next.command,
                            }),
                            now
                        )
                    );
                    nextRunId = nextRef.id;
                }
                const moved =
                    plan.card.lane !== card.lane ||
                    plan.card.stageKey !== card.stageKey;
                transaction.update(cardRef, {
                    ...plan.card,
                    activeRunId: nextRunId,
                    ...(nextRunId === null ? {} : { pendingAsk: null }),
                    lastRun: lastRunOf(run, close, now),
                    ...(moved ? { movedAt: now } : {}),
                    ...pullRequestPatch(pullRequest),
                    updatedAt: now,
                });
                return {
                    ignored: false,
                    cardId: run.cardId,
                    nextRunId,
                    next: finishedNextRun(plan.next, nextRunId, run),
                };
            }
        );
    }

    /** A person interrupting a run: the card stays in its column, idle, with who stopped it. */
    async stopOnCard(
        cardId: string,
        by: RunPerson,
        now: Date
    ): Promise<StopResult> {
        if (!isUsableDocumentId(cardId)) {
            return {
                ok: false,
                code: "CARD_NOT_FOUND",
                status: HTTP_STATUS.NOT_FOUND,
            };
        }
        const cardRef = this.cardRef(cardId);
        return await this.db.runTransaction(
            async (transaction): Promise<StopResult> => {
                const card = liveCard(await transaction.get(cardRef));
                if (card === null) {
                    return {
                        ok: false,
                        code: "CARD_NOT_FOUND",
                        status: HTTP_STATUS.NOT_FOUND,
                    };
                }
                if (card.activeRunId === null) {
                    return {
                        ok: false,
                        code: "CARD_RUN_NOT_ACTIVE",
                        status: HTTP_STATUS.CONFLICT,
                    };
                }
                const runRef = this.db
                    .collection(this.table)
                    .doc(card.activeRunId);
                const runSnap = await transaction.get(runRef);
                const close: RunClose = {
                    status: "stopped",
                    outcome: null,
                    endReason: "stopped",
                    stoppedBy: by,
                };
                if (runSnap.exists) {
                    transaction.update(runRef, {
                        ...close,
                        active: false,
                        finishedAt: now,
                        updatedAt: now,
                    });
                }
                transaction.update(cardRef, {
                    state: "idle",
                    activeRunId: null,
                    lastRun: lastRunOf(
                        { id: card.activeRunId, stageKey: card.stageKey ?? "" },
                        close,
                        now
                    ),
                    updatedAt: now,
                });
                return { ok: true, cardId, runId: card.activeRunId };
            }
        );
    }

    /**
     * Starts the queued runs `pick` chooses. The transaction reads and writes the board
     * document, so two promotions of the same board run one after the other and never fill
     * the same slot twice.
     */
    async promote(input: {
        boardId: string;
        pick: (runs: RunRecord[], board: BoardDTO) => RunRecord[];
        executorFor: (run: RunRecord) => StageExecutorKind | null;
        deadlineFor: (startedAt: Date, board: BoardDTO) => Date;
        now: Date;
    }): Promise<RunRecord[]> {
        const { now } = input;
        const boardRef = this.db.collection(BOARD_TABLE).doc(input.boardId);
        const activeQuery = this.db
            .collection(this.table)
            .where("boardId", "==", input.boardId)
            .where("active", "==", true);
        return await this.db.runTransaction(async (transaction) => {
            const boardSnap = await transaction.get(boardRef);
            const boardData = boardSnap.data();
            if (!(boardSnap.exists && boardData)) {
                return [];
            }
            const board = boardMapper.toDTO({ id: boardSnap.id, ...boardData });
            const runs = (await transaction.get(activeQuery)).docs.map(
                (docSnap) => this.toDTO(docSnap.id, docSnap.data())
            );
            const picked = input.pick(runs, board);
            if (picked.length === 0) {
                return [];
            }
            const deadline = input.deadlineFor(now, board);
            transaction.update(boardRef, { runsPumpedAt: now });
            const started = picked.map(
                (run): RunRecord => ({
                    ...run,
                    status: "running",
                    executor: input.executorFor(run),
                    startedAt: now.toISOString(),
                    deadlineAt: deadline.toISOString(),
                })
            );
            for (const run of started) {
                transaction.update(this.db.collection(this.table).doc(run.id), {
                    status: "running",
                    executor: run.executor,
                    startedAt: now,
                    deadlineAt: deadline,
                    updatedAt: now,
                });
                transaction.update(this.cardRef(run.cardId), {
                    state: "running",
                    updatedAt: now,
                });
            }
            return started;
        });
    }
}

export const runRepository = new RunRepository();
