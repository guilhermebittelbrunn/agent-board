import {
    BOARD_ROLES,
    type BoardRole,
    GITHUB_REPO_ROLES,
    type GithubIdentity,
    type GithubRepoRole,
    resolveEffectiveRole,
} from "@repo/kanban-contract";
import type {
    BoardAccessDTO,
    BoardMemberDTO,
    BoardMemberStatus,
} from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import Mapper from "./Mapper";

export const BOARD_MEMBER_TABLE = "boardMember";

export type BoardMemberFirestoreRow = Record<string, unknown> & { id: string };

/** The stored member as the API sees it; `BoardMemberDTO` is what leaves the API. */
export type BoardMemberRecord = {
    id: string;
    boardId: string;
    role: BoardRole;
    status: BoardMemberStatus;
    login: string;
    loginLower: string;
    githubId: string | null;
    userId: string | null;
    name: string | null;
    avatarUrl: string | null;
    invitedByUserId: string;
    githubRole: GithubRepoRole | null;
    githubRoleCheckedAt: string | null;
    joinedAt: string | null;
    /** Derived from `role` and `githubRole`, never stored, so the two cannot disagree. */
    effectiveRole: BoardRole | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

const PERSISTED_KEYS = [
    "boardId",
    "role",
    "status",
    "login",
    "loginLower",
    "githubId",
    "userId",
    "name",
    "avatarUrl",
    "invitedByUserId",
    "githubRole",
    "githubRoleCheckedAt",
    "joinedAt",
] as const;

/**
 * Logins only hold letters, digits and hyphens, so the last `__` always splits the board
 * id back out, and the same login cannot hold two invitations to one board.
 */
export const memberIdFor = (boardId: string, login: string): string =>
    `${boardId}__${login.toLowerCase()}`;

/** The person behind a member once they signed in: their profile and GitHub account. */
export type MemberIdentity = { userId: string; github: GithubIdentity };

export type MemberWrite = { id: string; document: Record<string, unknown> };

export const identityFields = (identity: MemberIdentity) => ({
    githubId: identity.github.id,
    userId: identity.userId,
    login: identity.github.login,
    loginLower: identity.github.login.toLowerCase(),
    name: identity.github.name,
    avatarUrl: identity.github.avatarUrl,
});

/** The member document of a board's owner, active from the start. */
export function ownerMemberWrite(
    boardId: string,
    owner: MemberIdentity,
    githubRole: GithubRepoRole | null,
    at: Date
): MemberWrite {
    return {
        id: memberIdFor(boardId, owner.github.login),
        document: {
            boardId,
            role: "owner",
            status: "active",
            ...identityFields(owner),
            invitedByUserId: owner.userId,
            githubRole,
            githubRoleCheckedAt: githubRole === null ? null : at,
            joinedAt: at,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
        },
    };
}

const asBoardRole = (value: unknown): BoardRole =>
    BOARD_ROLES.includes(value as BoardRole) ? (value as BoardRole) : "viewer";

const asGithubRole = (value: unknown): GithubRepoRole | null =>
    GITHUB_REPO_ROLES.includes(value as GithubRepoRole)
        ? (value as GithubRepoRole)
        : null;

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

const instantOrNull = (value: unknown): string | null =>
    value == null ? null : normalizeFirestoreInstant(value);

export const effectiveRoleOf = (
    role: BoardRole,
    githubRole: GithubRepoRole | null
): BoardRole | null =>
    githubRole === null ? null : resolveEffectiveRole(role, githubRole);

class BoardMemberMapper extends Mapper<
    BoardMemberFirestoreRow,
    BoardMemberRecord
> {
    toDTO(row: BoardMemberFirestoreRow): BoardMemberRecord {
        const { id, ...record } = row;
        const role = asBoardRole(record.role);
        const githubRole = asGithubRole(record.githubRole);
        const login = String(record.login ?? "");

        return {
            id,
            boardId: String(record.boardId ?? ""),
            role,
            status: record.status === "active" ? "active" : "pending",
            login,
            loginLower: String(record.loginLower ?? login.toLowerCase()),
            githubId: textOrNull(record.githubId),
            userId: textOrNull(record.userId),
            name: textOrNull(record.name),
            avatarUrl: textOrNull(record.avatarUrl),
            invitedByUserId: String(record.invitedByUserId ?? ""),
            githubRole,
            githubRoleCheckedAt: instantOrNull(record.githubRoleCheckedAt),
            joinedAt: instantOrNull(record.joinedAt),
            effectiveRole: effectiveRoleOf(role, githubRole),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt: instantOrNull(record.deletedAt),
        };
    }

    toPersistence(
        input: AllOptional<BoardMemberRecord> | Record<string, unknown>
    ): AllOptional<Record<string, unknown>> {
        const source = input as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of PERSISTED_KEYS) {
            if (source[key] !== undefined) {
                out[key] = source[key];
            }
        }
        return out as AllOptional<Record<string, unknown>>;
    }
}

export const boardMemberMapper = new BoardMemberMapper();

export function toBoardMemberDTO(
    member: BoardMemberRecord,
    selfMemberId: string
): BoardMemberDTO {
    return {
        id: member.id,
        boardId: member.boardId,
        login: member.login,
        name: member.name,
        avatarUrl: member.avatarUrl,
        role: member.role,
        status: member.status,
        githubRole: member.githubRole,
        effectiveRole: member.effectiveRole,
        githubRoleCheckedAt: member.githubRoleCheckedAt,
        joinedAt: member.joinedAt,
        createdAt: member.createdAt,
        isSelf: member.id === selfMemberId,
    };
}

export function toBoardAccess(member: BoardMemberRecord): BoardAccessDTO {
    return {
        role: member.role,
        githubRole: member.githubRole,
        effectiveRole: member.effectiveRole,
        checkedAt: member.githubRoleCheckedAt,
    };
}
