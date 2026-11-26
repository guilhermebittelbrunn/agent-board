import { parseBoardConfig } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import {
    hashRunSecretForTest,
    RUN_SECRET,
    RUN_SECRET_LENGTH,
} from "./agentRunFixtures";
import {
    createFakeCardEventRepository,
    type FakeCardEventRepository,
} from "./fakeCardEventRepository";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const {
    findWithTokenMock,
    findBoardMock,
    completeRunMock,
    getGithubClientMock,
    cardStore,
    eventStore,
} = vi.hoisted(() => ({
    findWithTokenMock: vi.fn(),
    findBoardMock: vi.fn(),
    completeRunMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    cardStore: { current: null as FakeCardRepository | null },
    eventStore: { current: null as FakeCardEventRepository | null },
}));

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {
        findWithToken: (...args: unknown[]) => findWithTokenMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
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

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: proxyTo(cardStore),
}));

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: proxyTo(eventStore),
}));

vi.mock("@/(shared)/lib/orchestrator/orchestrator", () => ({
    completeRun: (...args: unknown[]) => completeRunMock(...args),
}));

// Not `importActual`: the real module reads `@/env`, which validates every variable.
vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

const { POST } = await import("@/app/(routes)/agent/tools/[tool]/route");

const BOARD_ID = "agent-board-demo--sample-app";
const SLUG = "search-cards";
const CARD_ID = `${BOARD_ID}__${SLUG}`;
const RUN_ID = "run1";
const SHA_LENGTH = 40;
const TOKEN = `kbr_${RUN_ID}_${RUN_SECRET}`;
const SHA = "a".repeat(SHA_LENGTH);
const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
if (!parsed.success) {
    throw new Error("sample config is invalid");
}
const config = parsed.data;

const board = {
    id: BOARD_ID,
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
    config,
    stageSettings: {},
};

const runRecord = (overrides: Record<string, unknown> = {}) => ({
    id: RUN_ID,
    boardId: BOARD_ID,
    cardId: CARD_ID,
    slug: SLUG,
    stageKey: "analyze",
    command: "/analyze",
    agent: "planejador-tarefa",
    model: "opus",
    effort: "high",
    maxTurns: 200,
    branch: `feat/${SLUG}`,
    status: "running",
    active: true,
    deadlineAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
});

const storedToken = (overrides: Record<string, unknown> = {}) => ({
    tokenHash: hashRunSecretForTest(RUN_SECRET),
    tokenExpiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
});

function request(
    body: unknown,
    authorization: string | null = `Bearer ${TOKEN}`
): NextRequest {
    const headers = new Headers({ "content-type": "application/json" });
    if (authorization !== null) {
        headers.set("authorization", authorization);
    }
    return new Request("http://localhost:3002/agent/tools/x", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
}

const call = (tool: string, body: unknown, authorization?: string | null) =>
    POST(request(body, authorization), { params: Promise.resolve({ tool }) });

async function errorOf(response: Response) {
    const body = (await response.json()) as { error: { code: string } };
    return { status: response.status, code: body.error.code };
}

async function dataOf<T>(response: Response): Promise<T> {
    if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`expected 200, got ${response.status}`);
    }
    return ((await response.json()) as { data: T }).data;
}

const ref = { cardId: CARD_ID, stage: "analyze" };
let cards: FakeCardRepository;
let events: FakeCardEventRepository;

const agentEvents = () =>
    [...events.documents.values()].filter(
        (document) => (document.author as { kind: string }).kind === "agent"
    );

beforeEach(() => {
    for (const mock of [
        findWithTokenMock,
        findBoardMock,
        completeRunMock,
        getGithubClientMock,
    ]) {
        mock.mockReset();
    }
    cards = createFakeCardRepository();
    cardStore.current = cards;
    events = createFakeCardEventRepository(cards);
    eventStore.current = events;
    cards.seed(BOARD_ID, SLUG, {
        lane: "stage",
        stageKey: "analyze",
        state: "running",
        activeRunId: RUN_ID,
    });
    cards.seed(BOARD_ID, "other-card");
    findWithTokenMock.mockResolvedValue({
        run: runRecord(),
        token: storedToken(),
    });
    findBoardMock.mockResolvedValue(board);
    completeRunMock.mockResolvedValue({ ignored: false });
    getGithubClientMock.mockReturnValue(null);
});

describe("agent token", () => {
    it("refuses a call without a token, with WWW-Authenticate", async () => {
        const response = await call("get_card", { cardId: CARD_ID }, null);

        expect(await errorOf(response)).toEqual({
            status: 401,
            code: "AGENT_TOKEN_INVALID",
        });
        expect(response.headers.get("www-authenticate")).toBe("Bearer");
        expect(findWithTokenMock).not.toHaveBeenCalled();
    });

    it("refuses a token of the wrong format before reading the database", async () => {
        const response = await call(
            "get_card",
            { cardId: CARD_ID },
            "Bearer kbr_run1_short"
        );

        expect(await errorOf(response)).toEqual({
            status: 401,
            code: "AGENT_TOKEN_INVALID",
        });
        expect(findWithTokenMock).not.toHaveBeenCalled();
    });

    it("answers a missing run and a wrong secret the same way", async () => {
        findWithTokenMock.mockResolvedValueOnce(null);
        const missing = await call("get_card", { cardId: CARD_ID });
        const wrong = await call(
            "get_card",
            { cardId: CARD_ID },
            `Bearer kbr_${RUN_ID}_${"B".repeat(RUN_SECRET_LENGTH)}`
        );

        expect(await errorOf(missing)).toEqual({
            status: 401,
            code: "AGENT_TOKEN_INVALID",
        });
        expect(await errorOf(wrong)).toEqual({
            status: 401,
            code: "AGENT_TOKEN_INVALID",
        });
    });

    it("refuses a run that never got a token", async () => {
        findWithTokenMock.mockResolvedValue({
            run: runRecord(),
            token: { tokenHash: null, tokenExpiresAt: null },
        });

        expect(
            await errorOf(await call("get_card", { cardId: CARD_ID }))
        ).toEqual({ status: 401, code: "AGENT_TOKEN_INVALID" });
    });

    it("refuses an expired token", async () => {
        findWithTokenMock.mockResolvedValue({
            run: runRecord(),
            token: storedToken({ tokenExpiresAt: "2020-01-01T00:00:00.000Z" }),
        });

        expect(
            await errorOf(await call("get_card", { cardId: CARD_ID }))
        ).toEqual({ status: 401, code: "AGENT_TOKEN_EXPIRED" });
    });

    it("answers 404 when the board of the run is gone", async () => {
        findBoardMock.mockResolvedValue(null);

        expect(
            await errorOf(await call("get_card", { cardId: CARD_ID }))
        ).toEqual({ status: 404, code: "BOARD_NOT_FOUND" });
    });
});

describe("agent tools", () => {
    it("refuses an unknown tool", async () => {
        expect(
            await errorOf(await call("delete_card", { cardId: CARD_ID }))
        ).toEqual({ status: 404, code: "AGENT_TOOL_NOT_FOUND" });
    });

    it("refuses a payload outside the contract schema", async () => {
        const fiveQuestions = Array.from({ length: 5 }, () => ({
            question: "Q?",
            header: "H",
            options: [{ label: "A" }, { label: "B" }],
        }));

        expect(
            await errorOf(
                await call("ask", { ...ref, questions: fiveQuestions })
            )
        ).toEqual({ status: 400, code: "VALIDATION_FAILED" });
        expect(agentEvents()).toHaveLength(0);
    });

    it("refuses the token on another card", async () => {
        const response = await call("post_update", {
            cardId: `${BOARD_ID}__other-card`,
            stage: "analyze",
            markdown: "hi",
        });

        expect(await errorOf(response)).toEqual({
            status: 403,
            code: "AGENT_CARD_MISMATCH",
        });
        expect(agentEvents()).toHaveLength(0);
    });

    it("refuses the token on another stage", async () => {
        expect(
            await errorOf(
                await call("post_update", {
                    cardId: CARD_ID,
                    stage: "develop",
                    markdown: "hi",
                })
            )
        ).toEqual({ status: 403, code: "AGENT_STAGE_MISMATCH" });
    });

    it("writes post_update on the timeline with the run id", async () => {
        const data = await dataOf<{ eventId: string }>(
            await call("post_update", { ...ref, markdown: "Reading the spec" })
        );

        expect(events.documents.get(data.eventId)).toMatchObject({
            type: "update",
            markdown: "Reading the spec",
            runId: RUN_ID,
            stageKey: "analyze",
            author: { kind: "agent", name: "planejador-tarefa" },
        });
    });

    it("opens the card's pending ask on ask", async () => {
        const data = await dataOf<{ eventId: string }>(
            await call("ask", {
                ...ref,
                questions: [
                    {
                        question: "Header or OAuth?",
                        header: "Auth",
                        options: [{ label: "Header" }, { label: "OAuth" }],
                        recommended: 0,
                    },
                ],
            })
        );

        expect(cards.documents.get(CARD_ID)?.pendingAsk).toEqual({
            eventId: data.eventId,
            stageKey: "analyze",
            count: 1,
        });
        expect(events.documents.get(data.eventId)?.runId).toBe(RUN_ID);
    });

    it("refuses an ask once the card runs another run, without opening it", async () => {
        cards.documents.set(CARD_ID, {
            ...cards.documents.get(CARD_ID),
            activeRunId: "run2",
        });

        expect(
            await errorOf(
                await call("ask", {
                    ...ref,
                    questions: [
                        {
                            question: "Header or OAuth?",
                            header: "Auth",
                            options: [{ label: "Header" }, { label: "OAuth" }],
                        },
                    ],
                })
            )
        ).toEqual({
            status: HTTP_STATUS.CONFLICT,
            code: "AGENT_RUN_CLOSED",
        });
        expect(cards.documents.get(CARD_ID)?.pendingAsk ?? null).toBeNull();
        expect(agentEvents()).toHaveLength(0);
    });

    it("refuses an artifact path that leaves the repository", async () => {
        expect(
            await errorOf(
                await call("attach_artifact", {
                    ...ref,
                    path: "../secrets.md",
                    commitSha: SHA,
                })
            )
        ).toEqual({ status: 422, code: "CARD_ARTIFACT_PATH_INVALID" });
        await dataOf(
            await call("attach_artifact", {
                ...ref,
                path: "docs/x.md",
                commitSha: SHA,
            })
        );
        expect(agentEvents()).toHaveLength(1);
    });

    it("records the report, then lets completeRun decide, once", async () => {
        const data = await dataOf<{ ignored: boolean }>(
            await call("complete_stage", {
                ...ref,
                outcome: "success",
                summary: "### Análise — plano pronto",
            })
        );

        expect(data).toEqual({ ignored: false });
        expect(completeRunMock).toHaveBeenCalledTimes(1);
        expect(completeRunMock).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: RUN_ID,
                outcome: "success",
                endReason: "agent",
                board,
            })
        );
        expect(agentEvents()).toMatchObject([
            { type: "report", outcome: "success", runId: RUN_ID },
        ]);
        expect(cards.documents.get(CARD_ID)).toMatchObject({
            lane: "stage",
            stageKey: "analyze",
            state: "running",
        });
    });

    it("ignores complete_stage once the run is closed, without a second report", async () => {
        findWithTokenMock.mockResolvedValue({
            run: runRecord({ active: false, status: "finished" }),
            token: storedToken(),
        });

        const data = await dataOf<{ ignored: boolean }>(
            await call("complete_stage", {
                ...ref,
                outcome: "success",
                summary: "again",
            })
        );

        expect(data).toEqual({ ignored: true });
        expect(completeRunMock).not.toHaveBeenCalled();
        expect(agentEvents()).toHaveLength(0);
    });

    it("refuses every other tool once the run is closed", async () => {
        findWithTokenMock.mockResolvedValue({
            run: runRecord({ active: false, status: "stopped" }),
            token: storedToken(),
        });

        expect(
            await errorOf(await call("post_update", { ...ref, markdown: "x" }))
        ).toEqual({ status: 409, code: "AGENT_RUN_CLOSED" });
        expect(
            await errorOf(await call("get_card", { cardId: CARD_ID }))
        ).toEqual({ status: 409, code: "AGENT_RUN_CLOSED" });
    });

    it("answers 501 to create_card on its own board", async () => {
        expect(
            await errorOf(
                await call("create_card", {
                    boardId: BOARD_ID,
                    title: "Epic part",
                    specMarkdown: "# Spec",
                })
            )
        ).toEqual({ status: 501, code: "AGENT_TOOL_NOT_AVAILABLE" });
    });

    it("refuses create_card on another board", async () => {
        expect(
            await errorOf(
                await call("create_card", {
                    boardId: "someone-else--repo",
                    title: "x",
                    specMarkdown: "x",
                })
            )
        ).toEqual({ status: 403, code: "AGENT_CARD_MISMATCH" });
    });
});

describe("get_card", () => {
    it("reads the card without GitHub, with the answers paired and the artifacts", async () => {
        const question = events.seed({
            boardId: BOARD_ID,
            cardId: CARD_ID,
            stageKey: "analyze",
            lane: "stage",
            type: "question",
            author: { kind: "agent", name: "planejador-tarefa" },
            questions: [
                {
                    question: "Header?",
                    header: "Auth",
                    options: [{ label: "Header" }, { label: "OAuth" }],
                },
            ],
        });
        const answers = [
            {
                question: "Header?",
                header: "Auth",
                choice: { kind: "option" as const, option: 0, label: "Header" },
            },
        ];
        events.seed({
            boardId: BOARD_ID,
            cardId: CARD_ID,
            stageKey: "analyze",
            lane: "stage",
            type: "answer",
            author: { kind: "person", userId: "p1", login: "octo" },
            answers,
            questionEventId: question,
        });
        events.seed({
            boardId: BOARD_ID,
            cardId: CARD_ID,
            stageKey: "analyze",
            lane: "stage",
            type: "artifact",
            author: { kind: "agent", name: "planejador-tarefa" },
            artifact: { path: "docs/plan.md", commitSha: SHA },
        });

        const view = await dataOf<Record<string, unknown>>(
            await call("get_card", { cardId: CARD_ID })
        );

        expect(view).toMatchObject({
            card: { id: CARD_ID, slug: SLUG, branch: `feat/${SLUG}` },
            run: { id: RUN_ID, stageKey: "analyze", command: "/analyze" },
            repository: {
                owner: "agent-board-demo",
                name: "sample-app",
                baseBranch: config.baseBranch,
            },
            spec: {
                path: `specs/features/${SLUG}.md`,
                sha: null,
                content: null,
            },
            answers: [
                { questionEventId: question, stageKey: "analyze", answers },
            ],
            artifacts: [{ path: "docs/plan.md", commitSha: SHA }],
        });
        expect(JSON.stringify(view)).not.toContain(RUN_SECRET);
    });

    it("returns the spec body from GitHub without its frontmatter", async () => {
        getGithubClientMock.mockReturnValue({
            readFile: () =>
                Promise.resolve({
                    content: "---\nstatus: approved\n---\n# Search cards\n",
                    sha: "blob1",
                }),
        });

        const view = await dataOf<{ spec: { sha: string; content: string } }>(
            await call("get_card", { cardId: CARD_ID })
        );

        expect(view.spec.sha).toBe("blob1");
        expect(view.spec.content).toContain("# Search cards");
        expect(view.spec.content).not.toContain("status: approved");
    });

    it("keeps answering when GitHub fails", async () => {
        getGithubClientMock.mockReturnValue({
            readFile: () => Promise.reject(new Error("boom")),
        });

        const view = await dataOf<{ spec: { content: string | null } }>(
            await call("get_card", { cardId: CARD_ID })
        );

        expect(view.spec.content).toBeNull();
    });
});
