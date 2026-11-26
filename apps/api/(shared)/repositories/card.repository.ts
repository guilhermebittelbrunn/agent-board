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
    | { ok: false; code: "CARD_NOT_FOUND" | "CARD_RUN_ACTIVE" };

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
            if (typeof data.activeRunId === "string" && data.activeRunId) {
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
}

export const cardRepository = new CardRepository();
