import type {
    BoardRole,
    GithubRepoRole,
    InvitableBoardRole,
} from "@repo/kanban-contract";
import type { Query } from "firebase-admin/firestore";
import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import db from "../infra/database";
import { isAlreadyExistsError } from "../infra/firestore-errors";
import {
    BOARD_MEMBER_TABLE,
    type BoardMemberRecord,
    boardMemberMapper,
    identityFields,
    type MemberIdentity,
    type MemberWrite,
    memberIdFor,
    ownerMemberWrite,
} from "../mappers/board-member.mapper";
import { BaseRepository } from "./base.repository";

export type InviteMemberInput = {
    boardId: string;
    login: string;
    role: InvitableBoardRole;
    invitedByUserId: string;
};

export type MemberCheck = {
    githubRole: GithubRepoRole;
    checkedAt: Date;
    /** Rewritten when the person renamed their GitHub account. */
    login?: string;
};

const ROLE_ORDER: Record<BoardRole, number> = {
    owner: 0,
    maintainer: 1,
    operator: 2,
    viewer: 3,
};

/** Owner first, then the highest roles, then by login, the order the members screen shows. */
const byRoleThenLogin = (left: BoardMemberRecord, right: BoardMemberRecord) =>
    ROLE_ORDER[left.role] - ROLE_ORDER[right.role] ||
    left.loginLower.localeCompare(right.loginLower);

class BoardMemberRepository extends BaseRepository<BoardMemberRecord> {
    constructor() {
        super(db, BOARD_MEMBER_TABLE, boardMemberMapper);
    }

    private async rows(query: Query): Promise<BoardMemberRecord[]> {
        const snapshot = await query.get();
        return snapshot.docs.map((docSnap) =>
            this.toDTO(docSnap.id, docSnap.data() as Record<string, unknown>)
        );
    }

    private ofBoard(boardId: string): Query {
        return this.db.collection(this.table).where("boardId", "==", boardId);
    }

    private async createDocument(
        write: MemberWrite
    ): Promise<BoardMemberRecord | null> {
        try {
            await this.db
                .collection(this.table)
                .doc(write.id)
                .create(write.document);
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                return null;
            }
            throw error;
        }
        return boardMemberMapper.toDTO({ id: write.id, ...write.document });
    }

    /**
     * The id comes from the login, so `create()` refuses a second invitation for the same
     * login even when two arrive at once. `null` means the id was taken.
     */
    createMember(input: InviteMemberInput): Promise<BoardMemberRecord | null> {
        const at = new Date();
        return this.createDocument({
            id: memberIdFor(input.boardId, input.login),
            document: {
                boardId: input.boardId,
                role: input.role,
                status: "pending",
                login: input.login,
                loginLower: input.login.toLowerCase(),
                githubId: null,
                userId: null,
                name: null,
                avatarUrl: null,
                invitedByUserId: input.invitedByUserId,
                githubRole: null,
                githubRoleCheckedAt: null,
                joinedAt: null,
                createdAt: at,
                updatedAt: at,
                deletedAt: null,
            },
        });
    }

    /** For boards created before members existed; a concurrent creation wins and is read back. */
    async createOwnerMember(
        boardId: string,
        owner: MemberIdentity
    ): Promise<BoardMemberRecord | null> {
        const write = ownerMemberWrite(boardId, owner, null, new Date());
        return (
            (await this.createDocument(write)) ??
            (await this.findById(write.id))
        );
    }

    async findActive(
        boardId: string,
        githubId: string
    ): Promise<BoardMemberRecord | null> {
        const rows = await this.rows(
            this.ofBoard(boardId)
                .where("githubId", "==", githubId)
                .where("status", "==", "active")
                .limit(1)
        );
        return rows[0] ?? null;
    }

    async findPending(
        boardId: string,
        login: string
    ): Promise<BoardMemberRecord | null> {
        const id = memberIdFor(boardId, login);
        if (!isUsableDocumentId(id)) {
            return null;
        }
        const member = await this.findById(id);
        return member?.status === "pending" ? member : null;
    }

    /** Any member of the board answering to this login, invited or active. */
    async findByLogin(
        boardId: string,
        login: string
    ): Promise<BoardMemberRecord | null> {
        const rows = await this.rows(
            this.ofBoard(boardId)
                .where("loginLower", "==", login.toLowerCase())
                .limit(1)
        );
        return rows[0] ?? null;
    }

    /** A board holds tens of members at most, so the list is read whole and sorted here. */
    async listByBoard(boardId: string): Promise<BoardMemberRecord[]> {
        const rows = await this.rows(this.ofBoard(boardId));
        return rows.sort(byRoleThenLogin);
    }

    listActiveByGithubId(githubId: string): Promise<BoardMemberRecord[]> {
        return this.rows(
            this.db
                .collection(this.table)
                .where("githubId", "==", githubId)
                .where("status", "==", "active")
        );
    }

    /**
     * Turns an invitation into a membership inside a transaction, so an invitation canceled
     * in the meantime is not brought back. `null` when it is no longer pending.
     */
    async activate(
        id: string,
        identity: MemberIdentity
    ): Promise<BoardMemberRecord | null> {
        const ref = this.db.collection(this.table).doc(id);
        const at = new Date();
        return await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            const data = snapshot.data();
            if (!(snapshot.exists && data?.status === "pending")) {
                return null;
            }
            const patch = {
                status: "active",
                ...identityFields(identity),
                joinedAt: at,
                updatedAt: at,
            };
            transaction.update(ref, patch);
            return boardMemberMapper.toDTO({ id, ...data, ...patch });
        });
    }

    /** Claims every invitation waiting for this login, on any board. */
    async claimPendingFor(identity: MemberIdentity): Promise<void> {
        const pending = await this.rows(
            this.db
                .collection(this.table)
                .where("loginLower", "==", identity.github.login.toLowerCase())
                .where("status", "==", "pending")
        );
        await Promise.all(
            pending.map((member) => this.activate(member.id, identity))
        );
    }

    async updateRole(id: string, role: InvitableBoardRole): Promise<void> {
        await this.db
            .collection(this.table)
            .doc(id)
            .update({ role, updatedAt: new Date() });
    }

    async recordCheck(id: string, check: MemberCheck): Promise<void> {
        await this.db
            .collection(this.table)
            .doc(id)
            .update({
                githubRole: check.githubRole,
                githubRoleCheckedAt: check.checkedAt,
                ...(check.login
                    ? {
                          login: check.login,
                          loginLower: check.login.toLowerCase(),
                      }
                    : {}),
                updatedAt: check.checkedAt,
            });
    }

    /**
     * Deletes the document instead of stamping `deletedAt`: the id is the login, so a soft
     * delete would keep the same login from ever being invited again.
     */
    async remove(id: string): Promise<void> {
        await this.purge(id);
    }
}

export const boardMemberRepository = new BoardMemberRepository();
