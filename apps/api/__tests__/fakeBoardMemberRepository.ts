import type { InvitableBoardRole } from "@repo/kanban-contract";
import {
    type BoardMemberRecord,
    boardMemberMapper,
    identityFields,
    type MemberIdentity,
    memberIdFor,
    ownerMemberWrite,
} from "@/(shared)/mappers/board-member.mapper";
import type {
    InviteMemberInput,
    MemberCheck,
} from "@/(shared)/repositories/board-member.repository";

type StoredMember = Record<string, unknown>;

/**
 * In-memory stand-in for `boardMemberRepository`, mapped through the real mapper so the
 * routes see the same records they would read from Firestore.
 */
export function createFakeBoardMemberRepository() {
    const documents = new Map<string, StoredMember>();
    const read = (id: string): BoardMemberRecord | null => {
        const document = documents.get(id);
        return document ? boardMemberMapper.toDTO({ id, ...document }) : null;
    };
    const all = () =>
        [...documents.keys()].map((id) => read(id) as BoardMemberRecord);

    const activate = (id: string, identity: MemberIdentity) => {
        const document = documents.get(id);
        if (document?.status !== "pending") {
            return Promise.resolve(null);
        }
        const at = new Date();
        documents.set(id, {
            ...document,
            status: "active",
            ...identityFields(identity),
            joinedAt: at,
            updatedAt: at,
        });
        return Promise.resolve(read(id));
    };

    return {
        documents,
        seed(id: string, document: StoredMember) {
            documents.set(id, document);
        },
        seedOwner(boardId: string, owner: MemberIdentity, at: Date) {
            const write = ownerMemberWrite(boardId, owner, "admin", at);
            documents.set(write.id, write.document);
            return write.id;
        },
        seedInvite(
            boardId: string,
            login: string,
            role: InvitableBoardRole,
            extra: StoredMember = {}
        ) {
            const id = memberIdFor(boardId, login);
            const at = new Date("2026-11-25T10:00:00.000Z");
            documents.set(id, {
                boardId,
                role,
                status: "pending",
                login,
                loginLower: login.toLowerCase(),
                githubId: null,
                userId: null,
                name: null,
                avatarUrl: null,
                invitedByUserId: "p1",
                githubRole: null,
                githubRoleCheckedAt: null,
                joinedAt: null,
                createdAt: at,
                updatedAt: at,
                deletedAt: null,
                ...extra,
            });
            return id;
        },
        repository: {
            findById: (id: string) => Promise.resolve(read(id)),
            findActive: (boardId: string, githubId: string) =>
                Promise.resolve(
                    all().find(
                        (member) =>
                            member.boardId === boardId &&
                            member.githubId === githubId &&
                            member.status === "active"
                    ) ?? null
                ),
            findPending: (boardId: string, login: string) => {
                const member = read(memberIdFor(boardId, login));
                return Promise.resolve(
                    member?.status === "pending" ? member : null
                );
            },
            findByLogin: (boardId: string, login: string) =>
                Promise.resolve(
                    all().find(
                        (member) =>
                            member.boardId === boardId &&
                            member.loginLower === login.toLowerCase()
                    ) ?? null
                ),
            listByBoard: (boardId: string) =>
                Promise.resolve(
                    all().filter((member) => member.boardId === boardId)
                ),
            listActiveByGithubId: (githubId: string) =>
                Promise.resolve(
                    all().filter(
                        (member) =>
                            member.githubId === githubId &&
                            member.status === "active"
                    )
                ),
            createMember(input: InviteMemberInput) {
                const id = memberIdFor(input.boardId, input.login);
                if (documents.has(id)) {
                    return Promise.resolve(null);
                }
                const at = new Date();
                documents.set(id, {
                    ...input,
                    status: "pending",
                    loginLower: input.login.toLowerCase(),
                    githubId: null,
                    userId: null,
                    name: null,
                    avatarUrl: null,
                    githubRole: null,
                    githubRoleCheckedAt: null,
                    joinedAt: null,
                    createdAt: at,
                    updatedAt: at,
                    deletedAt: null,
                });
                return Promise.resolve(read(id));
            },
            createOwnerMember(boardId: string, owner: MemberIdentity) {
                const write = ownerMemberWrite(
                    boardId,
                    owner,
                    null,
                    new Date()
                );
                if (!documents.has(write.id)) {
                    documents.set(write.id, write.document);
                }
                return Promise.resolve(read(write.id));
            },
            activate,
            async claimPendingFor(identity: MemberIdentity) {
                for (const member of all()) {
                    if (
                        member.status === "pending" &&
                        member.loginLower ===
                            identity.github.login.toLowerCase()
                    ) {
                        await activate(member.id, identity);
                    }
                }
            },
            updateRole(id: string, role: InvitableBoardRole) {
                documents.set(id, { ...documents.get(id), role });
                return Promise.resolve();
            },
            recordCheck(id: string, check: MemberCheck) {
                documents.set(id, {
                    ...documents.get(id),
                    githubRole: check.githubRole,
                    githubRoleCheckedAt: check.checkedAt,
                    ...(check.login
                        ? {
                              login: check.login,
                              loginLower: check.login.toLowerCase(),
                          }
                        : {}),
                });
                return Promise.resolve();
            },
            remove(id: string) {
                documents.delete(id);
                return Promise.resolve();
            },
        },
    };
}

export type FakeBoardMemberRepository = ReturnType<
    typeof createFakeBoardMemberRepository
>;
