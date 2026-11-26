import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
    boardMemberMapper,
    memberIdFor,
    toBoardMemberDTO,
} from "@/(shared)/mappers/board-member.mapper";

const AT = "2026-11-26T10:00:00.000Z";
const at = Timestamp.fromDate(new Date(AT));

const row = (overrides: Record<string, unknown> = {}) => ({
    id: "acme--api__qa-reader",
    boardId: "acme--api",
    role: "operator",
    status: "active",
    login: "QA-Reader",
    loginLower: "qa-reader",
    githubId: "7",
    userId: "p7",
    name: "QA Reader",
    avatarUrl: null,
    invitedByUserId: "p1",
    githubRole: "read",
    githubRoleCheckedAt: at,
    joinedAt: at,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
});

describe("boardMemberMapper.toDTO", () => {
    it("turns Firestore instants into ISO and derives the effective role", () => {
        const member = boardMemberMapper.toDTO(row());

        expect(member).toMatchObject({
            githubRoleCheckedAt: AT,
            joinedAt: AT,
            createdAt: AT,
            role: "operator",
            githubRole: "read",
            effectiveRole: "viewer",
        });
    });

    it("has no effective role before the first check", () => {
        const member = boardMemberMapper.toDTO(
            row({
                status: "pending",
                githubRole: null,
                githubRoleCheckedAt: null,
            })
        );

        expect(member).toMatchObject({
            status: "pending",
            githubRole: null,
            githubRoleCheckedAt: null,
            effectiveRole: null,
        });
    });

    it("has no effective role once the repository is gone", () => {
        expect(
            boardMemberMapper.toDTO(row({ githubRole: "none" })).effectiveRole
        ).toBeNull();
    });
});

describe("boardMemberMapper.toPersistence", () => {
    it("keeps only the stored fields", () => {
        const stored = boardMemberMapper.toPersistence({
            role: "viewer",
            effectiveRole: "viewer",
            isSelf: true,
            id: "x",
        });

        expect(stored).toEqual({ role: "viewer" });
    });
});

describe("toBoardMemberDTO", () => {
    it("leaves the profile and GitHub ids inside the API and flags the caller's row", () => {
        const member = boardMemberMapper.toDTO(row());
        const dto = toBoardMemberDTO(member, member.id);

        expect(dto.isSelf).toBe(true);
        expect(dto).not.toHaveProperty("userId");
        expect(dto).not.toHaveProperty("githubId");
        expect(dto).not.toHaveProperty("invitedByUserId");
        expect(toBoardMemberDTO(member, "other").isSelf).toBe(false);
    });
});

describe("memberIdFor", () => {
    it("keys the member by board and lowercased login", () => {
        expect(memberIdFor("acme--api", "QA-Reader")).toBe(
            "acme--api__qa-reader"
        );
    });
});
