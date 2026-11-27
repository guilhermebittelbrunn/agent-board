import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import db from "../infra/database";
import {
    CARD_TABLE,
    type CardRecord,
    cardIdFor,
    cardMapper,
} from "../mappers/card.mapper";
import { BaseRepository } from "./base.repository";

/** One write of a backlog sync: a new card, or the fields that changed on an existing one. */
export type CardSyncWrite =
    | { kind: "create"; id: string; document: Record<string, unknown> }
    | { kind: "update"; id: string; patch: Record<string, unknown> };

export type CardMovePatch = {
    lane: "tasks" | "done";
    /** Only when the card goes back to Tasks, where it takes the end of the queue. */
    order?: number;
    movedByUserId: string;
};

export type CardMoveResult =
    | { ok: true; card: CardRecord }
    | {
          ok: false;
          code:
              | "CARD_NOT_FOUND"
              | "CARD_RUN_ACTIVE"
              | "CARD_DRAFT_NOT_APPROVED";
      };

/** Why a draft write was refused when the transaction read the card again. */
export type DraftWriteRefusal =
    | "CARD_NOT_FOUND"
    | "CARD_NOT_DRAFT"
    | "CARD_RUN_ACTIVE"
    | "CARD_SPEC_NOT_READY";

const isLiveRun = (value: unknown): boolean =>
    typeof value === "string" && value.length > 0;

/** Firestore refuses a batch with more than 500 writes. */
const BATCH_SIZE = 500;

class CardRepository extends BaseRepository<CardRecord> {
    constructor() {
        super(db, CARD_TABLE, cardMapper);
    }

    /** A board holds tens of specs, and the board screen needs all of them at once. */
    async listByBoard(boardId: string): Promise<CardRecord[]> {
        const snapshot = await this.db
            .collection(this.table)
            .where("boardId", "==", boardId)
            .where("deletedAt", "==", null)
            .get();
        return snapshot.docs.map((docSnap) =>
            this.toDTO(docSnap.id, docSnap.data() as Record<string, unknown>)
        );
    }

    async findBySlug(
        boardId: string,
        slug: string
    ): Promise<CardRecord | null> {
        const id = cardIdFor(boardId, slug);
        if (!isUsableDocumentId(id)) {
            return null;
        }
        const card = await this.findById(id);
        return card?.boardId === boardId ? card : null;
    }

    async applySync(writes: CardSyncWrite[]): Promise<void> {
        for (let start = 0; start < writes.length; start += BATCH_SIZE) {
            const batch = this.db.batch();
            for (const write of writes.slice(start, start + BATCH_SIZE)) {
                const ref = this.db.collection(this.table).doc(write.id);
                if (write.kind === "create") {
                    batch.set(ref, write.document);
                } else {
                    batch.update(ref, write.patch);
                }
            }
            await batch.commit();
        }
    }

    /** Writes `order = position` for each slug, in one batch per 500 cards. */
    async reorder(boardId: string, slugs: string[]): Promise<void> {
        const at = new Date();
        for (let start = 0; start < slugs.length; start += BATCH_SIZE) {
            const batch = this.db.batch();
            slugs.slice(start, start + BATCH_SIZE).forEach((slug, offset) => {
                batch.update(
                    this.db
                        .collection(this.table)
                        .doc(cardIdFor(boardId, slug)),
                    { order: start + offset, updatedAt: at }
                );
            });
            await batch.commit();
        }
    }

    /**
     * Takes the card out of the stage columns. The live run is checked again inside the
     * transaction, so a trigger landing between the read and the write cannot leave a
     * running card in Tasks.
     */
    async move(id: string, patch: CardMovePatch): Promise<CardMoveResult> {
        const ref = this.db.collection(this.table).doc(id);
        const at = new Date();
        const outcome = await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            const data = snapshot.data();
            if (!(snapshot.exists && data) || data.deletedAt != null) {
                return "CARD_NOT_FOUND" as const;
            }
            if (data.lane === "drafts") {
                return "CARD_DRAFT_NOT_APPROVED" as const;
            }
            if (isLiveRun(data.activeRunId)) {
                return "CARD_RUN_ACTIVE" as const;
            }
            transaction.update(ref, {
                lane: patch.lane,
                stageKey: null,
                state: "idle",
                ...(patch.order === undefined ? {} : { order: patch.order }),
                movedAt: at,
                movedByUserId: patch.movedByUserId,
                updatedAt: at,
            });
            return null;
        });
        if (outcome !== null) {
            return { ok: false, code: outcome };
        }
        const card = await this.findById(id);
        return card
            ? { ok: true, card }
            : { ok: false, code: "CARD_NOT_FOUND" };
    }

    /** A discarded draft keeps its document, so its id (and its branch) stay taken. */
    async isIdTaken(id: string): Promise<boolean> {
        if (!isUsableDocumentId(id)) {
            return true;
        }
        const snapshot = await this.db.collection(this.table).doc(id).get();
        return snapshot.exists;
    }

    /** `null` when another request created the same id first. */
    async createDraft(
        id: string,
        document: Record<string, unknown>
    ): Promise<CardRecord | null> {
        const ref = this.db.collection(this.table).doc(id);
        const created = await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            if (snapshot.exists) {
                return false;
            }
            transaction.create(ref, document);
            return true;
        });
        return created ? this.findById(id) : null;
    }

    /**
     * Moves an approved draft to Tasks. A run, a question or a failed round that appeared
     * after the route read the card is checked again here, so nothing unfinished gets approved.
     */
    async approveDraft(
        id: string,
        patch: Record<string, unknown>
    ): Promise<
        { ok: true; card: CardRecord } | { ok: false; code: DraftWriteRefusal }
    > {
        const ref = this.db.collection(this.table).doc(id);
        const refusal = await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            const data = snapshot.data();
            if (!(snapshot.exists && data) || data.deletedAt != null) {
                return "CARD_NOT_FOUND" as const;
            }
            if (data.lane !== "drafts") {
                return "CARD_NOT_DRAFT" as const;
            }
            if (
                isLiveRun(data.activeRunId) ||
                data.pendingAsk != null ||
                data.state !== "idle"
            ) {
                return "CARD_SPEC_NOT_READY" as const;
            }
            transaction.update(ref, patch);
            return null;
        });
        if (refusal !== null) {
            return { ok: false, code: refusal };
        }
        const card = await this.findById(id);
        return card
            ? { ok: true, card }
            : { ok: false, code: "CARD_NOT_FOUND" };
    }

    async discardDraft(
        id: string,
        at: Date
    ): Promise<DraftWriteRefusal | null> {
        const ref = this.db.collection(this.table).doc(id);
        return await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            const data = snapshot.data();
            if (!(snapshot.exists && data) || data.deletedAt != null) {
                return "CARD_NOT_FOUND" as const;
            }
            if (data.lane !== "drafts") {
                return "CARD_NOT_DRAFT" as const;
            }
            if (isLiveRun(data.activeRunId)) {
                return "CARD_RUN_ACTIVE" as const;
            }
            transaction.update(ref, { deletedAt: at, updatedAt: at });
            return null;
        });
    }
}

export const cardRepository = new CardRepository();
