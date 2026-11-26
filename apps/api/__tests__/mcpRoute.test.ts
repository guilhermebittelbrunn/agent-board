import { parseBoardConfig } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import { hashRunSecretForTest, RUN_SECRET } from "./agentRunFixtures";
import {
    createFakeCardEventRepository,
    type FakeCardEventRepository,
} from "./fakeCardEventRepository";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const { findWithTokenMock, cardStore, eventStore } = vi.hoisted(() => ({
    findWithTokenMock: vi.fn(),
    cardStore: { current: null as FakeCardRepository | null },
    eventStore: { current: null as FakeCardEventRepository | null },
}));

const BOARD_ID = "agent-board-demo--sample-app";
const CARD_ID = `${BOARD_ID}__search-cards`;
const TOKEN = `kbr_run1_${RUN_SECRET}`;
const config = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {
        findWithToken: (...args: unknown[]) => findWithTokenMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: () =>
            Promise.resolve({
                id: BOARD_ID,
                repository: { installationId: 1, owner: "o", name: "n" },
                config,
                stageSettings: {},
            }),
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
    completeRun: vi.fn(),
}));

vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => null,
}));

const { GET, DELETE, POST } = await import("@/app/(routes)/mcp/route");
const { JSON_RPC_ERROR } = await import("@/(shared)/lib/agent-contract/mcp");

function post(
    body: unknown,
    authorization: string | null = `Bearer ${TOKEN}`
): Promise<Response> {
    const headers = new Headers({ "content-type": "application/json" });
    if (authorization !== null) {
        headers.set("authorization", authorization);
    }
    return POST(
        new Request("http://localhost:3002/mcp", {
            method: "POST",
            headers,
            body: typeof body === "string" ? body : JSON.stringify(body),
        }) as unknown as NextRequest,
        { params: Promise.resolve({}) }
    );
}

let cards: FakeCardRepository;
let events: FakeCardEventRepository;

beforeEach(() => {
    findWithTokenMock.mockReset();
    findWithTokenMock.mockResolvedValue({
        run: {
            id: "run1",
            boardId: BOARD_ID,
            cardId: CARD_ID,
            stageKey: "analyze",
            active: true,
            status: "running",
        },
        token: {
            tokenHash: hashRunSecretForTest(RUN_SECRET),
            tokenExpiresAt: "2099-01-01T00:00:00.000Z",
        },
    });
    cards = createFakeCardRepository();
    cardStore.current = cards;
    events = createFakeCardEventRepository(cards);
    eventStore.current = events;
    cards.seed(BOARD_ID, "search-cards", {
        lane: "stage",
        stageKey: "analyze",
    });
});

describe("POST /mcp", () => {
    it("refuses without a token over HTTP, before any JSON-RPC", async () => {
        const response = await post(
            {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
            },
            null
        );

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(await response.json()).toEqual({
            error: { code: "AGENT_TOKEN_INVALID" },
        });
    });

    it("writes post_update through the same core as the HTTP tools", async () => {
        const response = await post({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
                name: "post_update",
                arguments: {
                    cardId: CARD_ID,
                    stage: "analyze",
                    markdown: "From MCP",
                },
            },
        });
        const body = (await response.json()) as {
            result: { isError: boolean; content: { text: string }[] };
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.result.isError).toBe(false);
        const { eventId } = JSON.parse(body.result.content[0].text) as {
            eventId: string;
        };
        expect(events.documents.get(eventId)).toMatchObject({
            type: "update",
            markdown: "From MCP",
            runId: "run1",
        });
    });

    it("answers an invalid payload with isError and VALIDATION_FAILED", async () => {
        const response = await post({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: {
                name: "ask",
                arguments: { cardId: CARD_ID, stage: "analyze" },
            },
        });
        const body = (await response.json()) as {
            result: { isError: boolean; content: { text: string }[] };
        };

        expect(body.result).toEqual({
            isError: true,
            content: [
                {
                    type: "text",
                    text: '{"error":{"code":"VALIDATION_FAILED"}}',
                },
            ],
        });
    });

    it("answers 202 with no body to a notification", async () => {
        const response = await post({
            jsonrpc: "2.0",
            method: "notifications/initialized",
        });

        expect(response.status).toBe(HTTP_STATUS.ACCEPTED);
        expect(await response.text()).toBe("");
    });

    it("answers invalid JSON with a JSON-RPC parse error", async () => {
        const response = await post("{not json");

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await response.json()).toMatchObject({
            jsonrpc: "2.0",
            id: null,
            error: { code: JSON_RPC_ERROR.PARSE_ERROR },
        });
    });
});

describe("GET and DELETE /mcp", () => {
    it("answer 405: no standalone stream and no session", () => {
        for (const response of [GET(), DELETE()]) {
            expect(response.status).toBe(HTTP_STATUS.METHOD_NOT_ALLOWED);
            expect(response.headers.get("allow")).toBe("POST");
        }
    });
});
