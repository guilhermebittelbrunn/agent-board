import type {
    BoardBacklogSyncDTO,
    BoardDTO,
    BoardStageSettingsDTO,
    RepositoryBoardLink,
} from "@repo/sdk/src/types";
import type { Query } from "firebase-admin/firestore";
import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import db from "../infra/database";
import { isAlreadyExistsError } from "../infra/firestore-errors";
import {
    type BoardBacklogSyncInput,
    type BoardRecordInput,
    boardMapper,
} from "../mappers/board.mapper";
import {
    BOARD_MEMBER_TABLE,
    type MemberWrite,
} from "../mappers/board-member.mapper";
import { BaseRepository } from "./base.repository";

export type BoardReloadPatch = Pick<
    BoardRecordInput,
    "name" | "repository" | "config" | "configSource"
>;

class BoardRepository extends BaseRepository<BoardDTO> {
    constructor() {
        super(db, "board", boardMapper);
    }

    private ownedBy(userId: string): Query {
        return this.db
            .collection(this.table)
            .where("ownerUserId", "==", userId);
    }

    /** The boards behind these ids, skipping the ones that are gone. */
    async listByIds(ids: string[]): Promise<BoardDTO[]> {
        const usable = [...new Set(ids)].filter((id) => isUsableDocumentId(id));
        if (usable.length === 0) {
            return [];
        }
        const snapshots = await this.db.getAll(
            ...usable.map((id) => this.db.collection(this.table).doc(id))
        );
        return snapshots.flatMap((snapshot) => {
            const data = snapshot.data() as Record<string, unknown> | undefined;
            if (!(snapshot.exists && data) || data.deletedAt != null) {
                return [];
            }
            return [this.toDTO(snapshot.id, data)];
        });
    }

    /** One board per repository keeps this list small, so it is not paginated. */
    async listByOwner(userId: string): Promise<BoardDTO[]> {
        if (!userId) {
            return [];
        }
        const snapshot = await this.ownedBy(userId)
            .where("deletedAt", "==", null)
            .get();

        return snapshot.docs
            .map((docSnap) =>
                this.toDTO(
                    docSnap.id,
                    docSnap.data() as Record<string, unknown>
                )
            )
            .sort((left, right) =>
                right.createdAt.localeCompare(left.createdAt)
            );
    }

    /**
     * The id is derived from the repository, so `create()` is what enforces one board per
     * repository: a second import, even a concurrent one, fails with ALREADY_EXISTS.
     * The owner's member document goes in the same batch, so neither exists without the
     * other. `null` means the id was taken.
     */
    async createForRepository(
        id: string,
        input: BoardRecordInput,
        ownerMember: MemberWrite
    ): Promise<BoardDTO | null> {
        const createdAt = new Date();
        const document = {
            ...boardMapper.toPersistence(input),
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
        };

        try {
            const batch = this.db.batch();
            batch.create(this.db.collection(this.table).doc(id), document);
            batch.create(
                this.db.collection(BOARD_MEMBER_TABLE).doc(ownerMember.id),
                ownerMember.document
            );
            await batch.commit();
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                return null;
            }
            throw error;
        }

        return boardMapper.toDTO({ id, ...document });
    }

    async applyReload(id: string, patch: BoardReloadPatch): Promise<void> {
        await this.db
            .collection(this.table)
            .doc(id)
            .update({
                ...boardMapper.toPersistence(patch),
                updatedAt: new Date(),
            });
    }

    /** Stores what the last backlog sync read, and answers it as the board shows it. */
    async recordBacklogSync(
        id: string,
        sync: BoardBacklogSyncInput
    ): Promise<BoardBacklogSyncDTO> {
        await this.db
            .collection(this.table)
            .doc(id)
            .update({ backlogSync: sync, updatedAt: new Date() });
        return { ...sync, syncedAt: sync.syncedAt.toISOString() };
    }

    async updateStageSettings(
        id: string,
        stageSettings: BoardStageSettingsDTO
    ): Promise<BoardDTO | null> {
        await this.db
            .collection(this.table)
            .doc(id)
            .update({ stageSettings, updatedAt: new Date() });
        return this.findById(id);
    }

    /** The link each id has for `userId`: their own board, someone else's, or none. */
    async linksFor(
        ids: string[],
        userId: string
    ): Promise<Map<string, RepositoryBoardLink>> {
        const links = new Map<string, RepositoryBoardLink>();
        const usable = ids.filter((id) => isUsableDocumentId(id));
        for (const id of ids) {
            links.set(id, null);
        }
        if (usable.length === 0) {
            return links;
        }

        const snapshots = await this.db.getAll(
            ...usable.map((id) => this.db.collection(this.table).doc(id))
        );
        for (const snapshot of snapshots) {
            if (!snapshot.exists) {
                continue;
            }
            const data = snapshot.data() as Record<string, unknown>;
            if (data.deletedAt != null) {
                continue;
            }
            links.set(
                snapshot.id,
                data.ownerUserId === userId ? { boardId: snapshot.id } : "taken"
            );
        }
        return links;
    }
}

export const boardRepository = new BoardRepository();
