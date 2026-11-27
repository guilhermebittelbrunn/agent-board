import {
    type CycleAdvance,
    type CycleState,
    isCycleActive,
    type RunPerson,
    stopCycleItems,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import type { OrchestratorRefusal } from "@/(shared)/lib/orchestrator/decide";
import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import db from "../infra/database";
import {
    CYCLE_TABLE,
    type CycleItemRecord,
    type CycleRecord,
    cycleItemsDocument,
    cycleMapper,
} from "../mappers/cycle.mapper";
import { BaseRepository } from "./base.repository";

const BOARD_TABLE = "board";

export type NewCycle = Pick<
    CycleRecord,
    "boardId" | "options" | "items" | "startedBy"
>;

export type CreateCycleResult =
    | OrchestratorRefusal
    | { ok: true; cycle: CycleRecord };

export type CycleAdvanceResult = {
    cycle: CycleRecord;
    start: string[];
    ended: boolean;
};

export type StopCycleResult =
    | OrchestratorRefusal
    | { ok: true; cycle: CycleRecord; wasRunning: boolean };

const byNewest = (left: CycleRecord, right: CycleRecord): number =>
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id);

const notFound = (): OrchestratorRefusal => ({
    ok: false,
    code: "CYCLE_NOT_FOUND",
    status: HTTP_STATUS.NOT_FOUND,
});

/**
 * A board runs one cycle at a time. `runningCycleId` on the board document is the lock: the
 * transactions that create, advance and stop a cycle read and write it, so two cycles cannot
 * both start, and the next one in the queue starts exactly once.
 */
class CycleRepository extends BaseRepository<CycleRecord> {
    constructor() {
        super(db, CYCLE_TABLE, cycleMapper);
    }

    private boardRef(boardId: string) {
        return this.db.collection(BOARD_TABLE).doc(boardId);
    }

    private live(snapshot: DocumentSnapshot): CycleRecord | null {
        const data = snapshot.data();
        if (!(snapshot.exists && data) || data.deletedAt != null) {
            return null;
        }
        return this.toDTO(snapshot.id, data);
    }

    private boardQuery(boardId: string) {
        return this.db.collection(this.table).where("boardId", "==", boardId);
    }

    private async readBoardCycles(
        transaction: Transaction,
        boardId: string
    ): Promise<CycleRecord[]> {
        const snapshot = await transaction.get(this.boardQuery(boardId));
        return snapshot.docs
            .map((docSnap) => this.live(docSnap))
            .filter((cycle): cycle is CycleRecord => cycle !== null);
    }

    /** Equality on `boardId` only, so no composite index; a board keeps tens of cycles. */
    async listByBoard(boardId: string): Promise<CycleRecord[]> {
        const snapshot = await this.boardQuery(boardId).get();
        return snapshot.docs
            .map((docSnap) => this.live(docSnap))
            .filter((cycle): cycle is CycleRecord => cycle !== null)
            .sort(byNewest);
    }

    async findInBoard(
        boardId: string,
        cycleId: string
    ): Promise<CycleRecord | null> {
        const cycle = await this.findById(cycleId);
        return cycle?.boardId === boardId && cycle.deletedAt === null
            ? cycle
            : null;
    }

    /**
     * Stores a cycle running when the board has none, queued otherwise. A slug already in an
     * active cycle is refused inside the same transaction, so two cycles cannot share a card.
     */
    async createOnBoard(input: {
        cycle: NewCycle;
        now: Date;
    }): Promise<CreateCycleResult> {
        const { cycle, now } = input;
        const boardRef = this.boardRef(cycle.boardId);
        const cycleRef = this.db.collection(this.table).doc();
        return await this.db.runTransaction(
            async (transaction): Promise<CreateCycleResult> => {
                const boardSnap = await transaction.get(boardRef);
                if (!boardSnap.exists) {
                    return {
                        ok: false,
                        code: "BOARD_NOT_FOUND",
                        status: HTTP_STATUS.NOT_FOUND,
                    };
                }
                const active = (
                    await this.readBoardCycles(transaction, cycle.boardId)
                ).filter((stored) => isCycleActive(stored.status));
                const busy = new Set(
                    active.flatMap((stored) =>
                        stored.items.map((item) => item.slug)
                    )
                );
                if (cycle.items.some((item) => busy.has(item.slug))) {
                    return {
                        ok: false,
                        code: "CYCLE_SPEC_BUSY",
                        status: HTTP_STATUS.CONFLICT,
                    };
                }
                const lockId = boardSnap.data()?.runningCycleId ?? null;
                const lockHeld = active.some(
                    (stored) =>
                        stored.id === lockId && stored.status === "running"
                );
                const status = lockHeld ? "queued" : "running";
                const document = {
                    ...cycle,
                    items: cycleItemsDocument(cycle.items),
                    status,
                    endReason: null,
                    stoppedBy: null,
                    startedAt: lockHeld ? null : now,
                    finishedAt: null,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                };
                transaction.set(cycleRef, document);
                if (!lockHeld) {
                    transaction.update(boardRef, {
                        runningCycleId: cycleRef.id,
                    });
                }
                return {
                    ok: true,
                    cycle: this.toDTO(cycleRef.id, document),
                };
            }
        );
    }

    /**
     * Applies `decide` to the stored cycle and writes what it returns. When the cycle ends,
     * the board's lock is released in the same transaction.
     */
    async applyAdvance(
        cycleId: string,
        decide: (
            cycle: CycleState<CycleItemRecord>
        ) => CycleAdvance<CycleItemRecord>,
        now: Date
    ): Promise<CycleAdvanceResult | null> {
        if (!isUsableDocumentId(cycleId)) {
            return null;
        }
        const cycleRef = this.db.collection(this.table).doc(cycleId);
        return await this.db.runTransaction(async (transaction) => {
            const stored = this.live(await transaction.get(cycleRef));
            if (stored === null) {
                return null;
            }
            const boardRef = this.boardRef(stored.boardId);
            const boardSnap = await transaction.get(boardRef);
            const decided = decide(stored);
            const patch = {
                status: decided.cycle.status,
                endReason: decided.cycle.endReason,
                items: cycleItemsDocument(decided.cycle.items),
                ...(decided.ended ? { finishedAt: now } : {}),
                updatedAt: now,
            };
            transaction.update(cycleRef, patch);
            if (
                decided.ended &&
                boardSnap.data()?.runningCycleId === stored.id
            ) {
                transaction.update(boardRef, { runningCycleId: null });
            }
            return {
                cycle: {
                    ...stored,
                    ...decided.cycle,
                    finishedAt: decided.ended
                        ? now.toISOString()
                        : stored.finishedAt,
                    updatedAt: now.toISOString(),
                },
                start: decided.start,
                ended: decided.ended,
            };
        });
    }

    /** Takes the oldest queued cycle when the board holds no running one; `null` otherwise. */
    async startNextQueued(boardId: string, now: Date): Promise<string | null> {
        const boardRef = this.boardRef(boardId);
        return await this.db.runTransaction(async (transaction) => {
            const boardSnap = await transaction.get(boardRef);
            if (!boardSnap.exists) {
                return null;
            }
            const cycles = await this.readBoardCycles(transaction, boardId);
            const lockId = boardSnap.data()?.runningCycleId ?? null;
            if (
                cycles.some(
                    (cycle) => cycle.id === lockId && cycle.status === "running"
                )
            ) {
                return null;
            }
            const next = cycles
                .filter((cycle) => cycle.status === "queued")
                .sort(
                    (left, right) =>
                        left.createdAt.localeCompare(right.createdAt) ||
                        left.id.localeCompare(right.id)
                )[0];
            if (next === undefined) {
                if (lockId !== null) {
                    transaction.update(boardRef, { runningCycleId: null });
                }
                return null;
            }
            transaction.update(this.db.collection(this.table).doc(next.id), {
                status: "running",
                startedAt: now,
                updatedAt: now,
            });
            transaction.update(boardRef, { runningCycleId: next.id });
            return next.id;
        });
    }

    /** A person stopping a queued or running cycle: the pending items are skipped. */
    async stop(input: {
        boardId: string;
        cycleId: string;
        by: RunPerson;
        now: Date;
    }): Promise<StopCycleResult> {
        if (!isUsableDocumentId(input.cycleId)) {
            return notFound();
        }
        const { now } = input;
        const cycleRef = this.db.collection(this.table).doc(input.cycleId);
        const boardRef = this.boardRef(input.boardId);
        return await this.db.runTransaction(
            async (transaction): Promise<StopCycleResult> => {
                const stored = this.live(await transaction.get(cycleRef));
                const boardSnap = await transaction.get(boardRef);
                if (stored === null || stored.boardId !== input.boardId) {
                    return notFound();
                }
                if (!isCycleActive(stored.status)) {
                    return {
                        ok: false,
                        code: "CYCLE_NOT_ACTIVE",
                        status: HTTP_STATUS.CONFLICT,
                    };
                }
                const items = stopCycleItems(stored.items, now.toISOString());
                transaction.update(cycleRef, {
                    status: "stopped",
                    endReason: "stopped",
                    stoppedBy: input.by,
                    items: cycleItemsDocument(items),
                    finishedAt: now,
                    updatedAt: now,
                });
                if (boardSnap.data()?.runningCycleId === stored.id) {
                    transaction.update(boardRef, { runningCycleId: null });
                }
                return {
                    ok: true,
                    wasRunning: stored.status === "running",
                    cycle: {
                        ...stored,
                        status: "stopped",
                        endReason: "stopped",
                        stoppedBy: input.by,
                        items,
                        finishedAt: now.toISOString(),
                        updatedAt: now.toISOString(),
                    },
                };
            }
        );
    }
}

export const cycleRepository = new CycleRepository();
