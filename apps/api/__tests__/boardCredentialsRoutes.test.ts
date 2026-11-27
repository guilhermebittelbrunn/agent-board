import { parseBoardConfig, scheduledTaskIdOf } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openSecret } from "@/(shared)/lib/credentials/secret-box";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import { credentialIdOf } from "@/(shared)/mappers/credential.mapper";
import {
    createFakeBoardMemberRepository,
    type FakeBoardMemberRepository,
} from "./fakeBoardMemberRepository";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    getGithubClientMock,
    findBoardMock,
    memberStore,
    envStub,
    credentialStore,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    findBoardMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
    envStub: {} as { CREDENTIALS_ENCRYPTION_KEY?: string },
    credentialStore: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/env", () => ({ env: envStub }));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
    },
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

type Owner = { boardId: string; userId: string; stageKey: string };

/** In-memory stand-in that seals like the real repository and reads through the real mapper. */
vi.mock("@/(shared)/repositories/credential.repository", async () => {
    const { sealSecret: seal } = await import(
        "@/(shared)/lib/credentials/secret-box"
    );
    const mapper = await import("@/(shared)/mappers/credential.mapper");
    const LAST_CHARS = 4;
    const lastFour = (value: string) => value.slice(-LAST_CHARS);
    const read = (id: string, data: Record<string, unknown>) =>
        mapper.credentialMapper.toDTO({ id, ...data });
    return {
        credentialRepository: {
            listOwned: (boardId: string, userId: string) =>
                Promise.resolve(
                    [...credentialStore.entries()]
                        .filter(
                            ([, data]) =>
                                data.boardId === boardId &&
                                data.userId === userId &&
                                data.deletedAt == null
                        )
                        .map(([id, data]) => read(id, data))
                ),
            saveScheduledTask: (
                input: Owner & {
                    task: { fireUrl: string; token: string };
                    key: Buffer;
                    now: Date;
                }
            ) => {
                const id = mapper.credentialIdOf(input);
                const document = {
                    userId: input.userId,
                    boardId: input.boardId,
                    stageKey: input.stageKey,
                    kind: "scheduled_task",
                    sealed: seal(input.key, JSON.stringify(input.task), id),
                    triggerIdLast4: lastFour(
                        scheduledTaskIdOf(input.task.fireUrl) ?? ""
                    ),
                    tokenLast4: lastFour(input.task.token),
                    lastCheckedAt: null,
                    lastCheckStatus: null,
                    createdAt: input.now,
                    updatedAt: input.now,
                    deletedAt: null,
                };
                credentialStore.set(id, document);
                return Promise.resolve(read(id, document));
            },
            removeOwned: (owner: Owner, now: Date) => {
                const id = mapper.credentialIdOf(owner);
                const data = credentialStore.get(id);
                if (!data || data.deletedAt != null) {
                    return Promise.resolve(false);
                }
                credentialStore.set(id, {
                    ...data,
                    sealed: null,
                    deletedAt: now,
                });
                return Promise.resolve(true);
            },
        },
    };
});

const { GET } = await import("@/app/(routes)/boards/[id]/credentials/route");
const { PUT, DELETE } = await import(
    "@/app/(routes)/boards/[id]/credentials/scheduled-tasks/[stageKey]/route"
);

const BOARD_ID = "agent-board-demo--sample-app";
const KEY_BYTES = 32;
const KEY_BASE64 = Buffer.alloc(KEY_BYTES, "k").toString("base64");
const FIRE_URL =
    "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGH/fire";
const TOKEN = "sk-ant-oat01-test-only-token-WXYZ";
const NO_CONTENT = 204;

const parsedConfig = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;
if (parsedConfig === undefined) {
    throw new Error("sample board.yml must parse");
}
const CONFIG = {
    ...parsedConfig,
    stages: parsedConfig.stages.map((stage) =>
        stage.key === "develop"
            ? { ...stage, runners: ["local" as const] }
            : stage
    ),
};

const BOARD = {
    id: BOARD_ID,
    ownerUserId: "p-owner",
    ownerGithubId: "1",
    name: "sample-app",
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
    config: CONFIG,
    configSource: { path: "", ref: "main", sha: "x", readAt: "" },
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    deletedAt: null,
};

// GitHub permissions come from the emulator client: octo is admin, qa-writer write,
// qa-reader read (an operator on the board, so a viewer in effect).
const PEOPLE = {
    owner: { id: "p-owner", githubId: "1", login: "octo" },
    operator: { id: "p-operator", githubId: "3", login: "qa-writer" },
    reader: { id: "p-reader", githubId: "4", login: "qa-reader" },
} as const;
type Person = keyof typeof PEOPLE;

const profileOf = (person: Person) => {
    const { id, githubId, login } = PEOPLE[person];
    return {
        id,
        reference_id: `uid-${person}`,
        github: { id: githubId, login, name: null, avatarUrl: null },
    };
};

function request(as: Person, body?: unknown): NextRequest {
    return {
        method: body === undefined ? "GET" : "PUT",
        url: `http://localhost:3002/boards/${BOARD_ID}/credentials`,
        headers: new Headers({
            "x-test-actor": `uid-${as}`,
            "content-type": "application/json",
        }),
        json: () => Promise.resolve(body ?? {}),
        text: () => Promise.resolve(JSON.stringify(body ?? {})),
    } as unknown as NextRequest;
}

const stageContext = (stageKey: string) => ({
    params: { id: BOARD_ID, stageKey },
});

async function errorCode(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } };
    return body.error.code;
}

const save = (as: Person, stageKey: string, body: unknown) =>
    PUT(request(as, body), stageContext(stageKey));

let members: FakeBoardMemberRepository;

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        getGithubClientMock,
        findBoardMock,
    ]) {
        mock.mockReset();
    }
    vi.unstubAllEnvs();
    credentialStore.clear();
    envStub.CREDENTIALS_ENCRYPTION_KEY = KEY_BASE64;
    getGithubClientMock.mockReturnValue(
        createGithubFakeClient(createGithubPermissionCache())
    );
    findBoardMock.mockResolvedValue(BOARD);
    resolveApiActorMock.mockImplementation((req: NextRequest) =>
        Promise.resolve({ uid: req.headers.get("x-test-actor") })
    );
    findByReferenceIdMock.mockImplementation((uid: string) =>
        Promise.resolve(profileOf(uid.replace("uid-", "") as Person))
    );

    members = createFakeBoardMemberRepository();
    memberStore.current = members;
    members.seedOwner(
        BOARD_ID,
        {
            userId: PEOPLE.owner.id,
            github: { id: "1", login: "octo", name: null, avatarUrl: null },
        },
        new Date("2026-11-25T10:00:00.000Z")
    );
    for (const person of ["operator", "reader"] as const) {
        const { id, githubId, login } = PEOPLE[person];
        members.seedInvite(BOARD_ID, login, "operator", {
            status: "active",
            githubId,
            userId: id,
        });
    }
});

describe("PUT /boards/[id]/credentials/scheduled-tasks/[stageKey]", () => {
    it("seals the task for the caller and answers only the last characters", async () => {
        const response = await save("operator", "analyze", {
            fireUrl: FIRE_URL,
            token: TOKEN,
            userId: PEOPLE.owner.id,
        });
        const text = await response.text();

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(JSON.parse(text)).toEqual({
            data: {
                stageKey: "analyze",
                triggerIdLast4: "EFGH",
                tokenLast4: "WXYZ",
                lastCheckedAt: null,
                lastCheckStatus: null,
                updatedAt: expect.any(String),
            },
        });
        expect(text).not.toContain(TOKEN);
        expect(text).not.toContain("trig_01ABCDEFGH");
        expect(text).not.toContain("sealed");

        const id = credentialIdOf({
            boardId: BOARD_ID,
            userId: PEOPLE.operator.id,
            stageKey: "analyze",
        });
        const stored = credentialStore.get(id);
        expect(stored?.userId).toBe(PEOPLE.operator.id);
        expect(JSON.stringify(stored)).not.toContain(TOKEN);
        expect(
            openSecret(
                Buffer.from(KEY_BASE64, "base64"),
                String(stored?.sealed),
                id
            )
        ).toBe(JSON.stringify({ fireUrl: FIRE_URL, token: TOKEN }));
    });

    it("answers 503 CREDENTIALS_ENCRYPTION_NOT_CONFIGURED without a usable key", async () => {
        envStub.CREDENTIALS_ENCRYPTION_KEY = "not-a-key";

        const response = await save("operator", "analyze", {
            fireUrl: FIRE_URL,
            token: TOKEN,
        });

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe(
            "CREDENTIALS_ENCRYPTION_NOT_CONFIGURED"
        );
        expect(credentialStore.size).toBe(0);
    });

    it("answers 404 CREDENTIAL_STAGE_NOT_FOUND for a stage the board does not have", async () => {
        const response = await save("operator", "spec", {
            fireUrl: FIRE_URL,
            token: TOKEN,
        });

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("CREDENTIAL_STAGE_NOT_FOUND");
    });

    it("answers 409 CREDENTIAL_STAGE_NOT_CLOUD when the board.yml keeps the stage local", async () => {
        const response = await save("operator", "develop", {
            fireUrl: FIRE_URL,
            token: TOKEN,
        });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CREDENTIAL_STAGE_NOT_CLOUD");
    });

    it.each([
        "https://example.com/fire",
        "http://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire",
    ])("answers 422 CREDENTIAL_FIRE_URL_INVALID for %s", async (fireUrl) => {
        const response = await save("operator", "analyze", {
            fireUrl,
            token: TOKEN,
        });

        expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect(await errorCode(response)).toBe("CREDENTIAL_FIRE_URL_INVALID");
        expect(credentialStore.size).toBe(0);
    });

    it("answers 400 VALIDATION_FAILED for a short token or a missing field", async () => {
        for (const body of [
            { fireUrl: FIRE_URL, token: "short" },
            { token: TOKEN },
        ]) {
            const response = await save("operator", "analyze", body);
            expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
            expect(await errorCode(response)).toBe("VALIDATION_FAILED");
        }
    });

    it("refuses a member who only views the board", async () => {
        const response = await save("reader", "analyze", {
            fireUrl: FIRE_URL,
            token: TOKEN,
        });

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(credentialStore.size).toBe(0);
    });
});

describe("GET /boards/[id]/credentials", () => {
    it("lists only the caller's credentials, with the cloud switch", async () => {
        await save("owner", "analyze", { fireUrl: FIRE_URL, token: TOKEN });
        await save("operator", "review", { fireUrl: FIRE_URL, token: TOKEN });

        const response = await GET(request("operator"), {
            params: { id: BOARD_ID },
        });
        const body = (await response.json()) as {
            data: {
                cloudCredentialsEnabled: boolean;
                scheduledTasks: { stageKey: string }[];
            };
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data.cloudCredentialsEnabled).toBe(true);
        expect(body.data.scheduledTasks.map((task) => task.stageKey)).toEqual([
            "review",
        ]);
    });

    it("lets a viewer read and reports the cloud switched off without a key", async () => {
        envStub.CREDENTIALS_ENCRYPTION_KEY = undefined;
        vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
        vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", "");

        const response = await GET(request("reader"), {
            params: { id: BOARD_ID },
        });
        const body = (await response.json()) as {
            data: { cloudCredentialsEnabled: boolean };
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data.cloudCredentialsEnabled).toBe(false);
    });
});

describe("DELETE /boards/[id]/credentials/scheduled-tasks/[stageKey]", () => {
    it("removes the caller's task and drops the sealed secret", async () => {
        await save("operator", "analyze", { fireUrl: FIRE_URL, token: TOKEN });

        const response = await DELETE(
            request("operator"),
            stageContext("analyze")
        );

        expect(response.status).toBe(NO_CONTENT);
        const stored = credentialStore.get(
            credentialIdOf({
                boardId: BOARD_ID,
                userId: PEOPLE.operator.id,
                stageKey: "analyze",
            })
        );
        expect(stored?.sealed).toBeNull();
        expect(stored?.deletedAt).not.toBeNull();
    });

    it("answers 404 CREDENTIAL_NOT_FOUND for another person's task", async () => {
        await save("owner", "analyze", { fireUrl: FIRE_URL, token: TOKEN });

        const response = await DELETE(
            request("operator"),
            stageContext("analyze")
        );

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("CREDENTIAL_NOT_FOUND");
    });
});
