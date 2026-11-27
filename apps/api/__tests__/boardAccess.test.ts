import type { GithubRepoRole } from "@repo/kanban-contract";
import type { UserDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    type BoardCapability,
    MEMBER_CHECK_TTL_MS,
    resolveBoardAccess,
} from "@/(shared)/lib/board-access";
import type { GithubClient } from "@/(shared)/lib/github/github-client";
import { GithubApiError } from "@/(shared)/lib/github/github-errors";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { applyWebhookEvent } from "@/(shared)/lib/github/github-webhook-events";
import {
    createFakeBoardMemberRepository,
    type FakeBoardMemberRepository,
} from "./fakeBoardMemberRepository";

const { findBoardMock, getGithubClientMock, memberStore } = vi.hoisted(() => ({
    findBoardMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
}));

vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/board-member.repository", () => ({
    boardMemberRepository: new Proxy(
        {},
        {
            get: (_target, property: string) =>
                (
                    memberStore.current?.repository as unknown as Record<
                        string,
                        unknown
                    >
                )[property],
        }
    ),
}));

const BOARD_ID = "agent-board-demo--sample-app";
const REPOSITORY = {
    installationId: 1,
    owner: "agent-board-demo",
    name: "sample-app",
    fullName: "agent-board-demo/sample-app",
    defaultBranch: "main",
    private: false,
};
const BOARD = {
    id: BOARD_ID,
    ownerUserId: "p-owner",
    ownerGithubId: "1",
    name: "sample-app",
    repository: REPOSITORY,
    config: {},
    configSource: { path: "", ref: "main", sha: "x", readAt: "" },
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    deletedAt: null,
};
const NOW = new Date("2026-11-26T12:00:00.000Z");
const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60_000;
const shiftedBy = (from: Date, ms: number) => new Date(from.getTime() + ms);

const profile = (id: string, githubId: string, login: string): UserDTO =>
    ({
        id,
        github: { id: githubId, login, name: null, avatarUrl: null },
    }) as UserDTO;

const OWNER = profile("p-owner", "1", "octo");
const GUEST = profile("p-guest", "2", "guest");

let members: FakeBoardMemberRepository;
let roles: Record<string, GithubRepoRole>;
let lookups: number;

const client: GithubClient = {
    listInstallationRepositories: () => Promise.resolve([]),
    readFile: () => Promise.resolve(null),
    getCollaboratorRole: (_repo, username) => {
        lookups += 1;
        return Promise.resolve(roles[username] ?? "none");
    },
};

const resolve = (
    person: UserDTO,
    capability: BoardCapability = "view",
    now = NOW
) =>
    resolveBoardAccess({
        boardId: BOARD_ID,
        profile: person,
        capability,
        now,
    });

async function refusal(result: Awaited<ReturnType<typeof resolve>>) {
    if (result.ok) {
        return null;
    }
    const body = (await result.response.json()) as { error: { code: string } };
    return { status: result.response.status, code: body.error.code };
}

beforeEach(() => {
    findBoardMock.mockReset();
    getGithubClientMock.mockReset();
    findBoardMock.mockResolvedValue(BOARD);
    getGithubClientMock.mockReturnValue(client);
    members = createFakeBoardMemberRepository();
    memberStore.current = members;
    roles = { octo: "admin", guest: "write" };
    lookups = 0;
});

describe("resolveBoardAccess", () => {
    it("answers BOARD_NOT_FOUND for a board that does not exist", async () => {
        findBoardMock.mockResolvedValue(null);

        expect(await refusal(await resolve(OWNER))).toEqual({
            status: HTTP_STATUS.NOT_FOUND,
            code: "BOARD_NOT_FOUND",
        });
    });

    it("answers BOARD_NOT_FOUND to an account without GitHub", async () => {
        const passwordAccount = { ...OWNER, github: null } as UserDTO;

        expect(await refusal(await resolve(passwordAccount))).toEqual({
            status: HTTP_STATUS.NOT_FOUND,
            code: "BOARD_NOT_FOUND",
        });
    });

    it("hides the board from a non-member even when they are admin on the repository", async () => {
        roles.guest = "admin";

        expect(await refusal(await resolve(GUEST))).toEqual({
            status: HTTP_STATUS.NOT_FOUND,
            code: "BOARD_NOT_FOUND",
        });
        expect(lookups).toBe(0);
    });

    it("creates the owner's member document for a board that predates members", async () => {
        const result = await resolve(OWNER);

        expect(result.ok).toBe(true);
        expect(members.documents.get(`${BOARD_ID}__octo`)).toMatchObject({
            role: "owner",
            status: "active",
            githubId: "1",
            githubRole: "admin",
        });
    });

    it("claims a pending invitation on the first visit", async () => {
        members.seedInvite(BOARD_ID, "Guest", "operator");

        const result = await resolve(GUEST);

        expect(result.ok && result.access).toEqual({
            role: "operator",
            githubRole: "write",
            effectiveRole: "operator",
            checkedAt: NOW.toISOString(),
        });
        expect(members.documents.get(`${BOARD_ID}__guest`)).toMatchObject({
            status: "active",
            githubId: "2",
            userId: "p-guest",
            login: "guest",
        });
    });

    it("answers GITHUB_APP_NOT_CONFIGURED without the App", async () => {
        getGithubClientMock.mockReturnValue(null);

        expect(await refusal(await resolve(OWNER))).toEqual({
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
            code: "GITHUB_APP_NOT_CONFIGURED",
        });
    });

    it("turns a GitHub failure into its error code", async () => {
        getGithubClientMock.mockReturnValue({
            ...client,
            getCollaboratorRole: () =>
                Promise.reject(new GithubApiError("rate_limited")),
        });

        expect(await refusal(await resolve(OWNER))).toEqual({
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
            code: "GITHUB_RATE_LIMITED",
        });
    });

    it("refuses a member who lost the repository and records it", async () => {
        members.seedInvite(BOARD_ID, "guest", "operator");
        roles.guest = "none";

        expect(await refusal(await resolve(GUEST))).toEqual({
            status: HTTP_STATUS.FORBIDDEN,
            code: "BOARD_REPOSITORY_ACCESS_LOST",
        });
        expect(members.documents.get(`${BOARD_ID}__guest`)).toMatchObject({
            githubRole: "none",
        });
    });

    it.each(["manageMembers", "configure", "trigger"] as const)(
        "refuses a viewer the %s capability",
        async (capability) => {
            members.seedInvite(BOARD_ID, "guest", "viewer");

            expect(await refusal(await resolve(GUEST, capability))).toEqual({
                status: HTTP_STATUS.FORBIDDEN,
                code: "BOARD_ROLE_INSUFFICIENT",
            });
        }
    );

    it("caps the board role by the repository permission", async () => {
        members.seedInvite(BOARD_ID, "guest", "maintainer");
        roles.guest = "read";

        const result = await resolve(GUEST, "view");
        const managing = await refusal(await resolve(GUEST, "manageMembers"));

        expect(result.ok && result.access.effectiveRole).toBe("viewer");
        expect(managing?.code).toBe("BOARD_ROLE_INSUFFICIENT");
    });

    it("lets operators trigger and maintainers manage members", async () => {
        members.seedInvite(BOARD_ID, "guest", "maintainer");
        roles.guest = "maintain";

        expect((await resolve(GUEST, "trigger")).ok).toBe(true);
        expect((await resolve(GUEST, "manageMembers")).ok).toBe(true);
        expect((await refusal(await resolve(GUEST, "configure")))?.code).toBe(
            "BOARD_ROLE_INSUFFICIENT"
        );
    });

    it("records the check only when it changed or is older than five minutes", async () => {
        await resolve(OWNER);
        const firstCheck = members.documents.get(`${BOARD_ID}__octo`)
            ?.githubRoleCheckedAt as Date;

        await resolve(OWNER, "view", shiftedBy(NOW, ONE_MINUTE_MS));
        expect(
            members.documents.get(`${BOARD_ID}__octo`)?.githubRoleCheckedAt
        ).toBe(firstCheck);

        const later = shiftedBy(NOW, MEMBER_CHECK_TTL_MS);
        await resolve(OWNER, "view", later);
        expect(
            members.documents.get(`${BOARD_ID}__octo`)?.githubRoleCheckedAt
        ).toEqual(later);

        roles.octo = "write";
        const changed = shiftedBy(later, ONE_SECOND_MS);
        await resolve(OWNER, "view", changed);
        expect(members.documents.get(`${BOARD_ID}__octo`)).toMatchObject({
            githubRole: "write",
            githubRoleCheckedAt: changed,
        });
    });

    it("rewrites the login of a member who renamed their GitHub account", async () => {
        await resolve(OWNER);
        const renamed = profile("p-owner", "1", "octo-renamed");
        roles["octo-renamed"] = "admin";

        await resolve(renamed, "view", shiftedBy(NOW, ONE_SECOND_MS));

        expect(members.documents.get(`${BOARD_ID}__octo`)).toMatchObject({
            login: "octo-renamed",
            loginLower: "octo-renamed",
        });
    });
});

describe("member webhook", () => {
    it("makes the next check ask GitHub again instead of the cache", async () => {
        const cache = createGithubPermissionCache();
        const cachedClient: GithubClient = {
            ...client,
            getCollaboratorRole: (repo, username) => {
                const fullName = `${repo.owner}/${repo.name}`;
                const cached = cache.get(fullName, username);
                if (cached) {
                    return Promise.resolve(cached);
                }
                lookups += 1;
                const role = roles[username] ?? "none";
                cache.set(fullName, username, role);
                return Promise.resolve(role);
            },
        };
        getGithubClientMock.mockReturnValue(cachedClient);
        members.seedInvite(BOARD_ID, "guest", "operator");

        expect((await resolve(GUEST)).ok).toBe(true);
        roles.guest = "none";
        expect((await resolve(GUEST)).ok).toBe(true);
        expect(lookups).toBe(1);

        applyWebhookEvent(
            "member",
            {
                action: "removed",
                repository: { full_name: "agent-board-demo/sample-app" },
                member: { login: "guest", id: 2 },
            },
            cache
        );

        expect((await refusal(await resolve(GUEST)))?.code).toBe(
            "BOARD_REPOSITORY_ACCESS_LOST"
        );
        expect(lookups).toBe(2);
    });
});
