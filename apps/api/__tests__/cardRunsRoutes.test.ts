import { parseBoardConfig } from "@repo/kanban-contract";
import type {
    BoardViewDTO,
    CardDTO,
    TriggerStageResultDTO,
} from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GithubClient } from "@/(shared)/lib/github/github-client";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import {
    createFakeBoardMemberRepository,
    type FakeBoardMemberRepository,
} from "./fakeBoardMemberRepository";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    getGithubClientMock,
    findBoardMock,
    recordBacklogSyncMock,
    memberStore,
    cardStore,
    triggerStageMock,
    stopRunMock,
    getStageExecutorMock,
    updateStageSettingsMock,
    chooseExecutorForMock,
    ensurePullRequestMock,
} = vi.hoisted(() => ({
    ensurePullRequestMock: vi.fn(),
    chooseExecutorForMock: vi.fn(),
    triggerStageMock: vi.fn(),
    stopRunMock: vi.fn(),
    getStageExecutorMock: vi.fn(),
    updateStageSettingsMock: vi.fn(),
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    findBoardMock: vi.fn(),
    recordBacklogSyncMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
    cardStore: { current: null as FakeCardRepository | null },
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
    },
}));

// Not `importActual`: the real module reads `@/env`, which validates every variable.
vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
        recordBacklogSync: (...args: unknown[]) =>
            recordBacklogSyncMock(...args),
        updateStageSettings: (...args: unknown[]) =>
            updateStageSettingsMock(...args),
    },
}));

const proxyTo = (store: { current: { repository: object } | null }) =>
    new Proxy(
        {},
        {
            get: (_target, property: string) =>
                (store.current?.repository as Record<string, unknown>)[
                    property
                ],
        }
    );

vi.mock("@/(shared)/repositories/board-member.repository", () => ({
    boardMemberRepository: proxyTo(memberStore),
}));

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: proxyTo(cardStore),
}));

// The board reads apply timeouts first; that is the orchestrator's, covered on its own.
vi.mock("@/(shared)/lib/orchestrator/tick-safely", () => ({
    tickSafely: () => Promise.resolve(),
}));

vi.mock("@/(shared)/lib/orchestrator/orchestrator", () => ({
    triggerStage: (...args: unknown[]) => triggerStageMock(...args),
    stopRun: (...args: unknown[]) => stopRunMock(...args),
}));

vi.mock("@/(shared)/lib/pull-request/pull-request-open", () => ({
    ensurePullRequest: (...args: unknown[]) => ensurePullRequestMock(...args),
}));

vi.mock("@/(shared)/lib/orchestrator/executor", () => ({
    getStageExecutor: () => getStageExecutorMock(),
}));

vi.mock("@/(shared)/lib/orchestrator/executor-mode", () => ({
    resolveStageExecutorMode: () =>
        getStageExecutorMock() === null ? null : "fake",
    chooseStageExecutorMode: () =>
        getStageExecutorMock() === null
            ? { ok: false, refusal: "no_executor" }
            : { ok: true, executor: "fake" },
}));

vi.mock("@/(shared)/lib/orchestrator/executor-choice", () => ({
    chooseExecutorFor: (...args: unknown[]) => chooseExecutorForMock(...args),
    resolveExecutorFor: () =>
        Promise.resolve(getStageExecutorMock() === null ? null : "fake"),
}));

const { POST: TRIGGER } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/runs/route"
);
const { POST: STOP } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/stop/route"
);
const { POST: OPEN_PULL_REQUEST } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/pull-request/route"
);
const { PATCH: STAGE_SETTINGS } = await import(
    "@/app/(routes)/boards/[id]/stage-settings/route"
);

const BOARD_ID = "agent-board-demo--sample-app";
const VALID_CONFIG = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;
const boardWith = (config: unknown = VALID_CONFIG) => ({
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
    config,
    configSource: {
        path: ".kanban/board.yml",
        ref: "main",
        sha: "x",
        readAt: "",
    },
    backlogSync: null,
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    deletedAt: null,
});

// GitHub permissions come from the emulator client: octo is admin, qa-writer write,
// qa-reader read.
const PEOPLE = {
    owner: { id: "p-owner", githubId: "1", login: "octo" },
    operator: { id: "p-operator", githubId: "3", login: "qa-writer" },
    reader: { id: "p-reader", githubId: "4", login: "qa-reader" },
    stranger: { id: "p-stranger", githubId: "5", login: "newcomer" },
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

function request(
    as: Person,
    { method = "GET", body }: { method?: string; body?: unknown } = {}
): NextRequest {
    return {
        method,
        url: `http://localhost:3002/boards/${BOARD_ID}/cards`,
        headers: new Headers({
            "x-test-actor": `uid-${as}`,
            "content-type": "application/json",
        }),
        json: () => Promise.resolve(body ?? {}),
        text: () => Promise.resolve(JSON.stringify(body ?? {})),
    } as unknown as NextRequest;
}

const boardContext = { params: { id: BOARD_ID } };
const cardContext = (slug: string) => ({ params: { id: BOARD_ID, slug } });

async function errorCode(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } };
    return body.error.code;
}

async function dataOf<T>(response: Response): Promise<T> {
    const body = (await response.json()) as { data: T };
    return body.data;
}

let members: FakeBoardMemberRepository;
let cards: FakeCardRepository;
let client: GithubClient;

const FAKE_EXECUTOR = { kind: "fake" };
const SLUG = "search-cards";

const trigger = (body: unknown, as: Person = "operator") =>
    TRIGGER(request(as, { method: "POST", body }), cardContext(SLUG));
const stop = (as: Person = "operator") =>
    STOP(request(as, { method: "POST" }), cardContext(SLUG));
const saveStageSettings = (body: unknown, as: Person = "owner") =>
    STAGE_SETTINGS(request(as, { method: "PATCH", body }), boardContext);

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        getGithubClientMock,
        findBoardMock,
        recordBacklogSyncMock,
        triggerStageMock,
        stopRunMock,
        getStageExecutorMock,
        updateStageSettingsMock,
        chooseExecutorForMock,
        ensurePullRequestMock,
    ]) {
        mock.mockReset();
    }
    client = createGithubFakeClient(createGithubPermissionCache());
    getGithubClientMock.mockImplementation(() => client);
    getStageExecutorMock.mockReturnValue(FAKE_EXECUTOR);
    chooseExecutorForMock.mockImplementation(() =>
        Promise.resolve(
            getStageExecutorMock() === null
                ? { ok: false, refusal: "no_executor" }
                : { ok: true, executor: "fake" }
        )
    );
    findBoardMock.mockResolvedValue(boardWith());
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

    cards = createFakeCardRepository();
    cardStore.current = cards;
    cards.seed(BOARD_ID, SLUG);
});

const runningCard = async () =>
    (await cards.repository.findBySlug(BOARD_ID, SLUG)) as NonNullable<
        Awaited<ReturnType<typeof cards.repository.findBySlug>>
    >;

describe("POST /boards/[id]/cards/[slug]/runs", () => {
    it("starts the stage as the operator and answers the card and the run", async () => {
        const card = await runningCard();
        triggerStageMock.mockResolvedValue({
            ok: true,
            card: {
                ...card,
                lane: "stage",
                stageKey: "analyze",
                state: "running",
                activeRunId: "r1",
            },
            run: {
                id: "r1",
                boardId: BOARD_ID,
                cardId: card.id,
                slug: SLUG,
                stageKey: "analyze",
                command: "/analyze",
                agent: null,
                model: "opus",
                effort: "high",
                maxTurns: 200,
                branch: "feat/search-cards",
                trigger: "drag",
                triggeredBy: { userId: PEOPLE.operator.id, login: "qa-writer" },
                executor: "fake",
                status: "running",
                active: true,
                outcome: null,
                endReason: null,
                stoppedBy: null,
                queuedAt: "2026-11-26T10:00:00.000Z",
                startedAt: "2026-11-26T10:00:00.000Z",
                deadlineAt: "2026-11-26T10:45:00.000Z",
                finishedAt: null,
                sessionUrl: null,
                turns: null,
                runnerId: null,
                claimedAt: null,
                runnerFinishedAt: null,
                createdAt: "2026-11-26T10:00:00.000Z",
                updatedAt: "2026-11-26T10:00:00.000Z",
                deletedAt: null,
            },
        });

        const response = await trigger({ stageKey: "analyze" });
        const data = await dataOf<TriggerStageResultDTO>(response);

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(data.card).toMatchObject({
            state: "running",
            activeRunId: "r1",
        });
        expect(data.card).not.toHaveProperty("movedByUserId");
        expect(data.run).toMatchObject({
            id: "r1",
            triggeredByLogin: "qa-writer",
            executor: "fake",
        });
        expect(data.run).not.toHaveProperty("triggeredBy");
        expect(triggerStageMock).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: SLUG,
                stageKey: "analyze",
                by: { userId: PEOPLE.operator.id, login: "qa-writer" },
            })
        );
    });

    it("refuses a viewer before anything runs", async () => {
        const response = await trigger({ stageKey: "analyze" }, "reader");

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
        expect(triggerStageMock).not.toHaveBeenCalled();
    });

    it("answers 503 RUN_EXECUTOR_UNAVAILABLE when nothing can run a stage", async () => {
        getStageExecutorMock.mockReturnValue(null);

        const response = await trigger({ stageKey: "analyze" });

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("RUN_EXECUTOR_UNAVAILABLE");
        expect(triggerStageMock).not.toHaveBeenCalled();
    });

    it("answers 409 RUN_NO_CREDENTIAL_FOR_STAGE when nothing the person owns serves the stage", async () => {
        chooseExecutorForMock.mockResolvedValue({
            ok: false,
            refusal: "stage_not_served",
        });

        const response = await trigger({ stageKey: "analyze" });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("RUN_NO_CREDENTIAL_FOR_STAGE");
        expect(triggerStageMock).not.toHaveBeenCalled();
    });

    it("asks for the executor of the person who triggers, not a global one", async () => {
        getStageExecutorMock.mockReturnValue(null);
        chooseExecutorForMock.mockResolvedValue({
            ok: true,
            executor: "local",
        });
        triggerStageMock.mockResolvedValue({
            ok: false,
            code: "CARD_RUN_ACTIVE",
            status: HTTP_STATUS.CONFLICT,
        });

        const response = await trigger({ stageKey: "analyze" });

        expect(chooseExecutorForMock).toHaveBeenCalledWith(
            "p-operator",
            expect.any(Date),
            expect.objectContaining({ key: "analyze" })
        );
        expect(response.status).not.toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(triggerStageMock).toHaveBeenCalled();
    });

    it("passes the orchestrator's refusal through", async () => {
        triggerStageMock.mockResolvedValue({
            ok: false,
            code: "CARD_RUN_ACTIVE",
            status: HTTP_STATUS.CONFLICT,
        });

        const response = await trigger({ stageKey: "analyze" });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CARD_RUN_ACTIVE");
    });

    it("refuses a body without a valid stage key", async () => {
        for (const body of [{}, { stageKey: "Bad Key" }, { stageKey: 3 }]) {
            const response = await trigger(body);

            expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
            expect(await errorCode(response)).toBe("VALIDATION_FAILED");
        }
        expect(triggerStageMock).not.toHaveBeenCalled();
    });
});

describe("POST /boards/[id]/cards/[slug]/stop", () => {
    it("stops the run as the operator", async () => {
        const card = await runningCard();
        stopRunMock.mockResolvedValue({
            ok: true,
            card: { ...card, lane: "stage", stageKey: "analyze" },
        });

        const response = await stop();

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(await dataOf<CardDTO>(response)).toMatchObject({ slug: SLUG });
        expect(stopRunMock).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: SLUG,
                by: { userId: PEOPLE.operator.id, login: "qa-writer" },
            })
        );
    });

    it("answers CARD_RUN_NOT_ACTIVE for a card without a run", async () => {
        stopRunMock.mockResolvedValue({
            ok: false,
            code: "CARD_RUN_NOT_ACTIVE",
            status: HTTP_STATUS.CONFLICT,
        });

        const response = await stop();

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CARD_RUN_NOT_ACTIVE");
    });

    it("refuses a viewer", async () => {
        const response = await stop("reader");

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(stopRunMock).not.toHaveBeenCalled();
    });
});

describe("PATCH /boards/[id]/stage-settings", () => {
    beforeEach(() => {
        updateStageSettingsMock.mockImplementation(
            (_id: string, stageSettings: unknown) =>
                Promise.resolve({ ...boardWith(), stageSettings })
        );
    });

    it("stores the owner's limits and gates, keeping the gate only where the stage allows it", async () => {
        const response = await saveStageSettings({
            stages: {
                analyze: { wipLimit: 1, approvalGate: true },
                develop: { wipLimit: null, approvalGate: true },
            },
        });
        const data = await dataOf<BoardViewDTO>(response);

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(updateStageSettingsMock).toHaveBeenCalledWith(BOARD_ID, {
            analyze: { wipLimit: 1, approvalGate: true },
            develop: { wipLimit: null, approvalGate: false },
        });
        expect(data.stageSettings.analyze).toEqual({
            wipLimit: 1,
            approvalGate: true,
        });
        expect(data.access.effectiveRole).toBe("owner");
        expect(data.executor).toBe("fake");
    });

    it("refuses an operator", async () => {
        const response = await saveStageSettings(
            { stages: { analyze: { wipLimit: 1, approvalGate: false } } },
            "operator"
        );

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
        expect(updateStageSettingsMock).not.toHaveBeenCalled();
    });

    it("refuses a limit outside 1 to 20 and a stage outside board.yml", async () => {
        for (const stages of [
            { analyze: { wipLimit: 0, approvalGate: false } },
            { analyze: { wipLimit: 21, approvalGate: false } },
            { analyze: { wipLimit: 1.5, approvalGate: false } },
            { deploy: { wipLimit: 1, approvalGate: false } },
        ]) {
            const response = await saveStageSettings({ stages });

            expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
            expect(await errorCode(response)).toBe("VALIDATION_FAILED");
        }
        expect(updateStageSettingsMock).not.toHaveBeenCalled();
    });
});

describe("POST /boards/[id]/cards/[slug]/pull-request", () => {
    const openPullRequest = (as: Person = "operator", slug = SLUG) =>
        OPEN_PULL_REQUEST(request(as, { method: "POST" }), cardContext(slug));

    it("opens the pull request as the operator and answers the card", async () => {
        const card = await runningCard();
        ensurePullRequestMock.mockResolvedValue({ ok: true, card });

        const response = await openPullRequest();

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect((await dataOf<CardDTO>(response)).slug).toBe(SLUG);
        expect(ensurePullRequestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                cardId: card.id,
                dispatchAs: { userId: PEOPLE.operator.id, login: "qa-writer" },
            })
        );
    });

    it.each([
        ["CARD_NOT_IN_PULL_REQUEST_STAGE", HTTP_STATUS.CONFLICT],
        ["GITHUB_APP_NOT_CONFIGURED", HTTP_STATUS.SERVICE_UNAVAILABLE],
        ["GITHUB_APP_PERMISSION_MISSING", HTTP_STATUS.SERVICE_UNAVAILABLE],
        ["GITHUB_PULL_REQUEST_REJECTED", HTTP_STATUS.UNPROCESSABLE_ENTITY],
    ])("answers %s with %i", async (code, status) => {
        ensurePullRequestMock.mockResolvedValue({ ok: false, code, status });

        const response = await openPullRequest();

        expect(response.status).toBe(status);
        expect(await errorCode(response)).toBe(code);
    });

    it("refuses a viewer before reaching GitHub", async () => {
        const response = await openPullRequest("reader");

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(ensurePullRequestMock).not.toHaveBeenCalled();
    });

    it("answers 404 for a card that is not on the board", async () => {
        const response = await openPullRequest("operator", "missing-card");

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("CARD_NOT_FOUND");
        expect(ensurePullRequestMock).not.toHaveBeenCalled();
    });
});
