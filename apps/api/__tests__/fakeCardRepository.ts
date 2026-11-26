import {
    type CardRecord,
    cardIdFor,
    cardMapper,
} from "@/(shared)/mappers/card.mapper";
import type {
    CardMovePatch,
    CardMoveResult,
    CardSyncWrite,
} from "@/(shared)/repositories/card.repository";

type StoredCard = Record<string, unknown>;

/**
 * In-memory stand-in for `cardRepository`, mapped through the real mapper so the routes
 * see the same records they would read from Firestore.
 */
export function createFakeCardRepository() {
    const documents = new Map<string, StoredCard>();
    const read = (id: string): CardRecord | null => {
        const document = documents.get(id);
        return document && document.deletedAt == null
            ? cardMapper.toDTO({ id, ...document })
            : null;
    };
    const listByBoard = (boardId: string) =>
        [...documents.keys()]
            .map((id) => read(id))
            .filter(
                (card): card is CardRecord =>
                    card !== null && card.boardId === boardId
            );

    return {
        documents,
        /** A card as a sync would create it, with any field overridden. */
        seed(boardId: string, slug: string, extra: StoredCard = {}) {
            const at = new Date("2026-11-26T10:00:00.000Z");
            const id = cardIdFor(boardId, slug);
            documents.set(id, {
                boardId,
                slug,
                title: slug,
                spec: {
                    path: `specs/features/${slug}.md`,
                    sha: "seeded",
                    status: "approved",
                },
                ready: true,
                orphan: false,
                lane: "tasks",
                stageKey: null,
                state: "idle",
                reworkLoops: 0,
                order: 0,
                branch: `feat/${slug}`,
                movedAt: null,
                movedByUserId: null,
                syncedAt: at,
                createdAt: at,
                updatedAt: at,
                deletedAt: null,
                ...extra,
            });
            return id;
        },
        repository: {
            findById: (id: string) => Promise.resolve(read(id)),
            listByBoard: (boardId: string) =>
                Promise.resolve(listByBoard(boardId)),
            findBySlug: (boardId: string, slug: string) => {
                const card = read(cardIdFor(boardId, slug));
                return Promise.resolve(card?.boardId === boardId ? card : null);
            },
            applySync(writes: CardSyncWrite[]) {
                for (const write of writes) {
                    documents.set(
                        write.id,
                        write.kind === "create"
                            ? write.document
                            : { ...documents.get(write.id), ...write.patch }
                    );
                }
                return Promise.resolve();
            },
            reorder(boardId: string, slugs: string[]) {
                slugs.forEach((slug, order) => {
                    const id = cardIdFor(boardId, slug);
                    documents.set(id, { ...documents.get(id), order });
                });
                return Promise.resolve();
            },
            move(id: string, patch: CardMovePatch): Promise<CardMoveResult> {
                const current = read(id);
                if (current === null) {
                    return Promise.resolve({
                        ok: false,
                        code: "CARD_NOT_FOUND",
                    });
                }
                if (current.activeRunId !== null) {
                    return Promise.resolve({
                        ok: false,
                        code: "CARD_RUN_ACTIVE",
                    });
                }
                const at = new Date();
                documents.set(id, {
                    ...documents.get(id),
                    lane: patch.lane,
                    stageKey: null,
                    state: "idle",
                    ...(patch.order === undefined
                        ? {}
                        : { order: patch.order }),
                    movedAt: at,
                    movedByUserId: patch.movedByUserId,
                    updatedAt: at,
                });
                const moved = read(id);
                return Promise.resolve(
                    moved
                        ? { ok: true, card: moved }
                        : { ok: false, code: "CARD_NOT_FOUND" }
                );
            },
        },
    };
}

export type FakeCardRepository = ReturnType<typeof createFakeCardRepository>;
