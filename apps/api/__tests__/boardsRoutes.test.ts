import { UserRoleLevel } from "@repo/auth/types";
import { type GithubRepoRole, parseBoardConfig } from "@repo/kanban-contract";
import { type RepositoryBoardLink, UserType } from "@repo/sdk/src/types";
import { AUTH_REQUEST_HEADER } from "@repo/shared/utils/helpers/auth-request-headers";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GithubClient } from "@/(shared)/lib/github/github-client";
import { GithubApiError } from "@/(shared)/lib/github/github-errors";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import {
    createFakeBoardMemberRepository,
    type FakeBoardMemberRepository,
} from "./fakeBoardMemberRepository";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    getGithubClientMock,
    listByOwnerMock,
    listByIdsMock,
    findByIdMock,
    createForRepositoryMock,
    applyReloadMock,
    linksForMock,
    listCardsMock,
    memberStore,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    listByOwnerMock: vi.fn(),
    listByIdsMock: vi.fn(),
    findByIdMock: vi.fn(),
    createForRepositoryMock: vi.fn(),
    applyReloadMock: vi.fn(),
    linksForMock: vi.fn(),
    listCardsMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
}));

vi.mock("@/(shared)/lib/storage", () => ({
    isStorageConfigured: () => false,
    readObject: vi.fn(),
}));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
        touchLastAccess: vi.fn(),
    },
}));

// Not `importActual`: the real module reads `@/env`, which validates every variable.
vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        listByOwner: (...args: unknown[]) => listByOwnerMock(...args),
        listByIds: (...args: unknown[]) => listByIdsMock(...args),
        findById: (...args: unknown[]) => findByIdMock(...args),
        createForRepository: (...args: unknown[]) =>
            createForRepositoryMock(...args),
        applyReload: (...args: unknown[]) => applyReloadMock(...args),
        linksFor: (...args: unknown[]) => linksForMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: {
        listByBoard: (...args: unknown[]) => listCardsMock(...args),
    },
}));

// The routes read whatever fake the current test installed.
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

// Outside the emulator and without runners, nothing runs a stage; runners are covered apart.
vi.mock("@/(shared)/lib/orchestrator/executor-choice", () => ({
    resolveExecutorFor: () => Promise.resolve(null),
}));

const { GET: LIST, POST: CREATE } = await import("@/app/(routes)/boards/route");
const { GET: REPOSITORIES } = await import(
    "@/app/(routes)/boards/repositories/route"
);
const { GET: PREVIEW } = await import("@/app/(routes)/boards/preview/route");
const { GET: DETAIL } = await import("@/app/(routes)/boards/[id]/route");
const { POST: RELOAD } = await import(
    "@/app/(routes)/boards/[id]/reload/route"
);

const OWNER_UID = "owner-uid";
const ADMIN_UID = "admin-uid";
const GITHUB = { id: "42", login: "octo", name: null, avatarUrl: null };
const OWNER_PROFILE = {
    id: "p1",
    reference_id: OWNER_UID,
    type: UserType.COMMON,
    github: GITHUB,
};
const ADMIN_PROFILE = {
    id: "p0",
    reference_id: ADMIN_UID,
    type: UserType.ADMIN,
};

const SAMPLE_ID = "agent-board-demo--sample-app";
const GIT_BLOB_SHA = /^[0-9a-f]{40}$/;
const SAMPLE_REPOSITORY = {
    installationId: 1,
    owner: "agent-board-demo",
    name: "sample-app",
    fullName: "agent-board-demo/sample-app",
    defaultBranch: "main",
    private: false,
};
const VALID_CONFIG = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;

const storedBoard = (sha: string) => ({
    id: SAMPLE_ID,
    ownerUserId: OWNER_PROFILE.id,
    ownerGithubId: GITHUB.id,
    name: "sample-app",
    repository: SAMPLE_REPOSITORY,
    config: VALID_CONFIG,
    configSource: {
        path: ".kanban/board.yml",
        ref: "main",
        sha,
        readAt: "2026-11-25T14:02:00.000Z",
    },
    stageSettings: {},
    createdAt: "2026-11-25T14:02:00.000Z",
    updatedAt: "2026-11-25T14:02:00.000Z",
    deletedAt: null,
});

function request(
    url: string,
    { method = "GET", body, impersonating = false } = {} as {
        method?: string;
        body?: unknown;
        impersonating?: boolean;
    }
): NextRequest {
    const actor = impersonating ? ADMIN_UID : OWNER_UID;
    return {
        method,
        url: `http://localhost:3002${url}`,
        headers: new Headers({
            [AUTH_REQUEST_HEADER.USER_ID]: actor,
            [AUTH_REQUEST_HEADER.USER_ROLE]: impersonating
                ? UserRoleLevel.ADMIN
                : UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_ROLE]: UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_USER_ID]: OWNER_UID,
            "content-type": "application/json",
        }),
        json: () => Promise.resolve(body ?? {}),
        text: () => Promise.resolve(JSON.stringify(body ?? {})),
    } as unknown as NextRequest;
}

const idContext = (id: string) => ({ params: { id } });

async function errorCode(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } };
    return body.error.code;
}

let client: GithubClient;
let members: FakeBoardMemberRepository;

const UNCHECKED_OWNER_ACCESS = {
    role: "owner",
    githubRole: null,
    effectiveRole: null,
    checkedAt: null,
};

function withRole(role: GithubRepoRole): GithubClient {
    return { ...client, getCollaboratorRole: () => Promise.resolve(role) };
}

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        getGithubClientMock,
        listByOwnerMock,
        listByIdsMock,
        findByIdMock,
        createForRepositoryMock,
        applyReloadMock,
        linksForMock,
        listCardsMock,
    ]) {
        mock.mockReset();
    }
    listCardsMock.mockResolvedValue([]);

    members = createFakeBoardMemberRepository();
    memberStore.current = members;
    listByOwnerMock.mockResolvedValue([]);
    listByIdsMock.mockResolvedValue([]);

    client = createGithubFakeClient(createGithubPermissionCache());
    getGithubClientMock.mockImplementation(() => client);
    resolveApiActorMock.mockResolvedValue({ uid: OWNER_UID });
    findByReferenceIdMock.mockImplementation((uid: string) =>
        Promise.resolve(uid === ADMIN_UID ? ADMIN_PROFILE : OWNER_PROFILE)
    );
    linksForMock.mockImplementation((ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, null])))
    );
    createForRepositoryMock.mockImplementation((id: string, input: object) =>
        Promise.resolve({ id, ...input })
    );
});

describe("GET /boards", () => {
    it("lists the boards of the person in context", async () => {
        listByOwnerMock.mockResolvedValue([storedBoard("abc")]);

        const response = await LIST(request("/boards"));

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(await response.json()).toEqual({
            data: [
                {
                    ...storedBoard("abc"),
                    access: UNCHECKED_OWNER_ACCESS,
                    executor: null,
                    storageAvailable: false,
                },
            ],
        });
        expect(listByOwnerMock).toHaveBeenCalledWith(OWNER_PROFILE.id);
    });

    it("claims pending invitations and lists the boards the person is a member of", async () => {
        const otherBoard = {
            ...storedBoard("abc"),
            id: "acme--api",
            ownerUserId: "someone-else",
            createdAt: "2026-11-26T09:00:00.000Z",
        };
        members.seedInvite("acme--api", "Octo", "operator", {
            githubRole: "read",
            githubRoleCheckedAt: new Date("2026-11-26T09:30:00.000Z"),
        });
        listByOwnerMock.mockResolvedValue([storedBoard("abc")]);
        listByIdsMock.mockImplementation((ids: string[]) =>
            Promise.resolve(ids.includes("acme--api") ? [otherBoard] : [])
        );

        const response = await LIST(request("/boards"));
        const body = (await response.json()) as {
            data: { id: string; access: unknown }[];
        };

        expect(body.data.map((board) => [board.id, board.access])).toEqual([
            [
                "acme--api",
                {
                    role: "operator",
                    githubRole: "read",
                    effectiveRole: "viewer",
                    checkedAt: "2026-11-26T09:30:00.000Z",
                },
            ],
            [SAMPLE_ID, UNCHECKED_OWNER_ACCESS],
        ]);
        expect(members.documents.get("acme--api__octo")).toMatchObject({
            status: "active",
            githubId: GITHUB.id,
            userId: "p1",
        });
    });

    it("does not claim invitations while an admin impersonates the person", async () => {
        members.seedInvite("acme--api", "octo", "operator");
        resolveApiActorMock.mockResolvedValue({ uid: ADMIN_UID });

        const response = await LIST(
            request("/boards", { impersonating: true })
        );

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(members.documents.get("acme--api__octo")).toMatchObject({
            status: "pending",
        });
    });
});

describe("GET /boards/[id]", () => {
    it("answers BOARD_NOT_FOUND for a board that is not the person's", async () => {
        findByIdMock.mockResolvedValue({
            ...storedBoard("abc"),
            ownerUserId: "someone-else",
        });

        const response = await DETAIL(
            request(`/boards/${SAMPLE_ID}`),
            idContext(SAMPLE_ID)
        );

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_NOT_FOUND");
        expect(findByIdMock).toHaveBeenCalledWith(SAMPLE_ID);
    });

    it("answers BOARD_NOT_FOUND for a board that does not exist", async () => {
        findByIdMock.mockResolvedValue(null);

        const response = await DETAIL(
            request(`/boards/${SAMPLE_ID}`),
            idContext(SAMPLE_ID)
        );

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_NOT_FOUND");
    });

    it("returns the person's board with their access", async () => {
        findByIdMock.mockResolvedValue(storedBoard("abc"));

        const response = await DETAIL(
            request(`/boards/${SAMPLE_ID}`),
            idContext(SAMPLE_ID)
        );
        const body = (await response.json()) as {
            data: Record<string, unknown> & { access: { checkedAt: string } };
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data).toEqual({
            ...storedBoard("abc"),
            access: {
                role: "owner",
                githubRole: "admin",
                effectiveRole: "owner",
                checkedAt: expect.any(String),
            },
            executor: null,
            storageAvailable: false,
        });
    });
});

describe("GET /boards/repositories", () => {
    it("lists the installation with the board link of each repository", async () => {
        linksForMock.mockResolvedValue(
            new Map<string, RepositoryBoardLink>([
                [SAMPLE_ID, { boardId: SAMPLE_ID }],
                ["agent-board-demo--invalid-config", "taken"],
                ["agent-board-demo--no-kanban", null],
            ])
        );

        const response = await REPOSITORIES(request("/boards/repositories"));
        const body = (await response.json()) as {
            data: {
                fullName: string;
                board: unknown;
                installationId: number;
            }[];
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data.map((row) => [row.fullName, row.board])).toEqual([
            ["agent-board-demo/sample-app", { boardId: SAMPLE_ID }],
            ["agent-board-demo/invalid-config", "taken"],
            ["agent-board-demo/no-kanban", null],
        ]);
        expect(linksForMock).toHaveBeenCalledWith(
            [
                SAMPLE_ID,
                "agent-board-demo--invalid-config",
                "agent-board-demo--no-kanban",
            ],
            OWNER_PROFILE.id
        );
    });

    it("keeps only the repositories where the person is admin", async () => {
        client = {
            ...client,
            getCollaboratorRole: (repo) =>
                Promise.resolve(repo.name === "sample-app" ? "admin" : "write"),
        };

        const response = await REPOSITORIES(request("/boards/repositories"));
        const body = (await response.json()) as {
            data: { fullName: string }[];
        };

        expect(body.data.map((row) => row.fullName)).toEqual([
            "agent-board-demo/sample-app",
        ]);
    });

    it("lists nothing when the person is not admin anywhere", async () => {
        client = withRole("write");

        const response = await REPOSITORIES(request("/boards/repositories"));
        const body = (await response.json()) as { data: unknown[] };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data).toEqual([]);
    });

    it("answers GITHUB_APP_NOT_CONFIGURED without the App", async () => {
        getGithubClientMock.mockReturnValue(null);

        const response = await REPOSITORIES(request("/boards/repositories"));

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("GITHUB_APP_NOT_CONFIGURED");
    });

    it("answers BOARD_GITHUB_ACCOUNT_REQUIRED for a password account", async () => {
        findByReferenceIdMock.mockResolvedValue({
            ...OWNER_PROFILE,
            github: null,
        });

        const response = await REPOSITORIES(request("/boards/repositories"));

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_GITHUB_ACCOUNT_REQUIRED");
    });

    it("turns a GitHub failure into its error code", async () => {
        client = {
            ...client,
            listInstallationRepositories: () =>
                Promise.reject(
                    new GithubApiError("rate_limited", HTTP_STATUS.FORBIDDEN)
                ),
        };

        const response = await REPOSITORIES(request("/boards/repositories"));

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("GITHUB_RATE_LIMITED");
    });
});

describe("GET /boards/preview", () => {
    const preview = (repository: string) =>
        PREVIEW(
            request(
                `/boards/preview?repository=${encodeURIComponent(repository)}`
            )
        );

    it("answers valid with the parsed config", async () => {
        const response = await preview("agent-board-demo/sample-app");
        const body = (await response.json()) as {
            data: Record<string, unknown>;
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data).toMatchObject({
            status: "valid",
            githubRole: "admin",
            board: null,
            repository: SAMPLE_REPOSITORY,
            file: { path: ".kanban/board.yml", ref: "main" },
            config: VALID_CONFIG,
            rawStages: null,
            issues: [],
        });
    });

    it("answers invalid with the issues and the raw stages", async () => {
        const response = await preview("Agent-Board-Demo/Invalid-Config");
        const body = (await response.json()) as {
            data: Record<string, unknown>;
        };

        expect(body.data).toMatchObject({
            status: "invalid",
            config: null,
            issues: [
                {
                    path: "stages[2].onRework",
                    rule: "rework_target_invalid",
                    params: {
                        stageColumn: "Revisando",
                        target: "deploy",
                        suggestion: "develop",
                    },
                },
            ],
        });
        expect(body.data.rawStages).toEqual([
            {
                key: "analyze",
                column: "Análise",
                command: "/analyze",
                model: null,
                onRework: null,
            },
            {
                key: "develop",
                column: "Executando",
                command: "/develop",
                model: null,
                onRework: null,
            },
            {
                key: "review",
                column: "Revisando",
                command: "/review",
                model: null,
                onRework: "deploy",
            },
        ]);
    });

    it("answers missing for a repository without the kit", async () => {
        const response = await preview("agent-board-demo/no-kanban");
        const body = (await response.json()) as {
            data: Record<string, unknown>;
        };

        expect(body.data).toMatchObject({
            status: "missing",
            file: null,
            config: null,
            issues: [],
        });
    });

    it("reports the existing board link", async () => {
        linksForMock.mockResolvedValue(new Map([[SAMPLE_ID, "taken"]]));

        const response = await preview("agent-board-demo/sample-app");
        const body = (await response.json()) as { data: { board: unknown } };

        expect(body.data.board).toBe("taken");
    });

    it.each([
        "",
        "no-slash",
        "a/b/c",
        "-bad/repo",
        "owner/..",
        "owner/with space",
    ])("refuses the repository %j with VALIDATION_FAILED", async (value) => {
        const response = await preview(value);

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    });

    it("hides a repository outside the installation", async () => {
        const response = await preview("someone/else");

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe(
            "GITHUB_REPOSITORY_NOT_ACCESSIBLE"
        );
    });

    it("hides the repository from a person without access", async () => {
        client = withRole("none");

        const response = await preview("agent-board-demo/sample-app");

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe(
            "GITHUB_REPOSITORY_NOT_ACCESSIBLE"
        );
    });

    it.each(["read", "triage", "write", "maintain"] as const)(
        "refuses a %s collaborator with BOARD_IMPORT_FORBIDDEN",
        async (role) => {
            client = withRole(role);

            const response = await preview("agent-board-demo/sample-app");

            expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
            expect(await errorCode(response)).toBe("BOARD_IMPORT_FORBIDDEN");
        }
    );

    it("turns a GitHub outage into GITHUB_UNAVAILABLE", async () => {
        client = {
            ...client,
            readFile: () => Promise.reject(new GithubApiError("unavailable")),
        };

        const response = await preview("agent-board-demo/sample-app");

        expect(response.status).toBe(HTTP_STATUS.BAD_GATEWAY);
        expect(await errorCode(response)).toBe("GITHUB_UNAVAILABLE");
    });

    it("lets an unexpected error through instead of hiding it", async () => {
        client = {
            ...client,
            readFile: () => Promise.reject(new Error("boom")),
        };

        await expect(preview("agent-board-demo/sample-app")).rejects.toThrow(
            "boom"
        );
    });
});

describe("POST /boards", () => {
    const create = (body: unknown, impersonating = false) =>
        CREATE(request("/boards", { method: "POST", body, impersonating }));

    it("creates the board with the owner, the snapshot and the sha", async () => {
        const response = await create({
            repository: "agent-board-demo/sample-app",
        });

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(createForRepositoryMock).toHaveBeenCalledTimes(1);
        const [id, input] = createForRepositoryMock.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(id).toBe(SAMPLE_ID);
        expect(input).toMatchObject({
            ownerUserId: OWNER_PROFILE.id,
            ownerGithubId: GITHUB.id,
            name: "sample-app",
            repository: SAMPLE_REPOSITORY,
            config: VALID_CONFIG,
            configSource: { path: ".kanban/board.yml", ref: "main" },
        });
        expect((input.configSource as { sha: string }).sha).toMatch(
            GIT_BLOB_SHA
        );
    });

    it("writes the owner's member document in the same call and answers their access", async () => {
        const response = await create({
            repository: "agent-board-demo/sample-app",
        });
        const body = (await response.json()) as {
            data: { access: Record<string, unknown> };
        };

        const [, , ownerMember] = createForRepositoryMock.mock.calls[0] as [
            string,
            unknown,
            { id: string; document: Record<string, unknown> },
        ];
        expect(ownerMember.id).toBe(`${SAMPLE_ID}__octo`);
        expect(ownerMember.document).toMatchObject({
            boardId: SAMPLE_ID,
            role: "owner",
            status: "active",
            githubId: GITHUB.id,
            userId: OWNER_PROFILE.id,
            login: GITHUB.login,
            githubRole: "admin",
        });
        expect(body.data.access).toMatchObject({
            role: "owner",
            githubRole: "admin",
            effectiveRole: "owner",
        });
    });

    it("takes the installation from the listing, never from the body", async () => {
        await create({
            repository: "agent-board-demo/sample-app",
            installationId: 999,
        });

        const [, input] = createForRepositoryMock.mock.calls[0] as [
            string,
            { repository: { installationId: number } },
        ];
        expect(input.repository.installationId).toBe(1);
    });

    it("answers BOARD_ALREADY_EXISTS when the id is taken", async () => {
        createForRepositoryMock.mockResolvedValue(null);

        const response = await create({
            repository: "agent-board-demo/sample-app",
        });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("BOARD_ALREADY_EXISTS");
    });

    it("refuses an invalid file with BOARD_CONFIG_INVALID", async () => {
        const response = await create({
            repository: "agent-board-demo/invalid-config",
        });

        expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect(await errorCode(response)).toBe("BOARD_CONFIG_INVALID");
        expect(createForRepositoryMock).not.toHaveBeenCalled();
    });

    it("refuses a missing file with BOARD_CONFIG_NOT_FOUND", async () => {
        const response = await create({
            repository: "agent-board-demo/no-kanban",
        });

        expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect(await errorCode(response)).toBe("BOARD_CONFIG_NOT_FOUND");
        expect(createForRepositoryMock).not.toHaveBeenCalled();
    });

    it.each(["read", "triage", "write", "maintain"] as const)(
        "refuses a %s collaborator with BOARD_IMPORT_FORBIDDEN without writing",
        async (role) => {
            client = withRole(role);

            const response = await create({
                repository: "agent-board-demo/sample-app",
            });

            expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
            expect(await errorCode(response)).toBe("BOARD_IMPORT_FORBIDDEN");
            expect(createForRepositoryMock).not.toHaveBeenCalled();
        }
    );

    it("hides the repository from a person without access without writing", async () => {
        client = withRole("none");

        const response = await create({
            repository: "agent-board-demo/sample-app",
        });

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe(
            "GITHUB_REPOSITORY_NOT_ACCESSIBLE"
        );
        expect(createForRepositoryMock).not.toHaveBeenCalled();
    });

    it("refuses a body without a valid repository", async () => {
        const response = await create({ repository: "nope" });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    });

    it("refuses to write while an admin impersonates the person", async () => {
        resolveApiActorMock.mockResolvedValue({ uid: ADMIN_UID });

        const response = await create(
            { repository: "agent-board-demo/sample-app" },
            true
        );

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe(
            "AUTH_REQUEST_IMPERSONATION_READ_ONLY"
        );
        expect(createForRepositoryMock).not.toHaveBeenCalled();
    });

    it("lets the impersonating admin read the list", async () => {
        resolveApiActorMock.mockResolvedValue({ uid: ADMIN_UID });
        listByOwnerMock.mockResolvedValue([]);

        const response = await LIST(
            request("/boards", { impersonating: true })
        );

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(listByOwnerMock).toHaveBeenCalledWith(OWNER_PROFILE.id);
    });
});

describe("POST /boards/[id]/reload", () => {
    const reload = () =>
        RELOAD(
            request(`/boards/${SAMPLE_ID}/reload`, { method: "POST" }),
            idContext(SAMPLE_ID)
        );

    async function currentSha(): Promise<string> {
        const file = await client.readFile(
            SAMPLE_REPOSITORY,
            ".kanban/board.yml",
            "main"
        );
        return file?.sha ?? "";
    }

    it("answers BOARD_NOT_FOUND for someone else's board", async () => {
        findByIdMock.mockResolvedValue({
            ...storedBoard("abc"),
            ownerUserId: "someone-else",
        });

        const response = await reload();

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_NOT_FOUND");
    });

    it("does not write when the sha did not change", async () => {
        findByIdMock.mockResolvedValue(storedBoard(await currentSha()));

        const response = await reload();
        const body = (await response.json()) as { data: { outcome: string } };

        expect(body.data.outcome).toBe("unchanged");
        expect(applyReloadMock).not.toHaveBeenCalled();
    });

    it("applies a new file and reports the stage changes", async () => {
        const previous = storedBoard("old-sha");
        previous.config = {
            ...VALID_CONFIG,
            stages: (VALID_CONFIG?.stages ?? []).filter(
                (stage) => stage.key !== "test"
            ),
        } as typeof VALID_CONFIG;
        findByIdMock.mockResolvedValue(previous);

        const response = await reload();
        const body = (await response.json()) as {
            data: {
                outcome: string;
                changes: unknown;
                board: { configSource: { sha: string } };
            };
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data.outcome).toBe("updated");
        expect(body.data.changes).toEqual({
            added: [{ key: "test", column: "Testando" }],
            removed: [],
            changed: [],
            moved: false,
        });
        expect(body.data.board.configSource.sha).toBe(await currentSha());
        expect(applyReloadMock).toHaveBeenCalledWith(
            SAMPLE_ID,
            expect.objectContaining({
                config: VALID_CONFIG,
                configSource: expect.objectContaining({
                    sha: await currentSha(),
                    readAt: expect.any(Date),
                }),
            })
        );
    });

    describe("when the new file removes a column", () => {
        const withExtraStage = () => {
            const previous = storedBoard("old-sha");
            previous.config = {
                ...VALID_CONFIG,
                stages: [
                    ...(VALID_CONFIG?.stages ?? []),
                    {
                        ...(VALID_CONFIG?.stages[0] ?? {}),
                        key: "extra",
                        column: "Extra",
                    },
                ],
            } as typeof VALID_CONFIG;
            return previous;
        };

        it("refuses with BOARD_RELOAD_STAGE_HAS_CARDS while a card sits in it", async () => {
            findByIdMock.mockResolvedValue(withExtraStage());
            listCardsMock.mockResolvedValue([
                { slug: "a", lane: "stage", stageKey: "analyze" },
                { slug: "b", lane: "stage", stageKey: "extra" },
            ]);

            const response = await reload();

            expect(response.status).toBe(HTTP_STATUS.CONFLICT);
            expect(await errorCode(response)).toBe(
                "BOARD_RELOAD_STAGE_HAS_CARDS"
            );
            expect(listCardsMock).toHaveBeenCalledWith(SAMPLE_ID);
            expect(applyReloadMock).not.toHaveBeenCalled();
        });

        it("applies when no card is in the removed column", async () => {
            findByIdMock.mockResolvedValue(withExtraStage());
            listCardsMock.mockResolvedValue([
                { slug: "a", lane: "stage", stageKey: "analyze" },
                { slug: "b", lane: "tasks", stageKey: null },
            ]);

            const response = await reload();
            const body = (await response.json()) as {
                data: { outcome: string; changes: { removed: unknown[] } };
            };

            expect(body.data.outcome).toBe("updated");
            expect(body.data.changes.removed).toEqual([
                { key: "extra", column: "Extra" },
            ]);
            expect(applyReloadMock).toHaveBeenCalled();
        });
    });

    it("keeps the previous snapshot when the file became invalid", async () => {
        client = {
            ...client,
            readFile: () =>
                Promise.resolve({
                    content: "version: 1\nname: x\n",
                    sha: "new",
                }),
        };
        findByIdMock.mockResolvedValue(storedBoard("old-sha"));

        const response = await reload();
        const body = (await response.json()) as {
            data: { outcome: string; issues: { path: string; rule: string }[] };
        };

        expect(body.data.outcome).toBe("invalid");
        expect(body.data.issues).toEqual([
            { path: "stages", rule: "required", params: {} },
        ]);
        expect(applyReloadMock).not.toHaveBeenCalled();
    });

    it("keeps the previous snapshot when the file is gone", async () => {
        client = { ...client, readFile: () => Promise.resolve(null) };
        findByIdMock.mockResolvedValue(storedBoard("old-sha"));

        const response = await reload();
        const body = (await response.json()) as { data: { outcome: string } };

        expect(body.data.outcome).toBe("missing");
        expect(applyReloadMock).not.toHaveBeenCalled();
    });

    it("refuses the owner who lost admin on the repository", async () => {
        client = withRole("write");
        findByIdMock.mockResolvedValue(storedBoard("old-sha"));

        const response = await reload();

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
        expect(applyReloadMock).not.toHaveBeenCalled();
    });

    it("refuses a maintainer, since only the owner configures the board", async () => {
        client = withRole("admin");
        findByIdMock.mockResolvedValue({
            ...storedBoard("old-sha"),
            ownerUserId: "someone-else",
        });
        members.seedInvite(SAMPLE_ID, "octo", "maintainer");

        const response = await reload();

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
        expect(applyReloadMock).not.toHaveBeenCalled();
    });
});
