import { parseBoardConfig } from "@repo/kanban-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "./runnerFixtures";

const { findBySlugMock, enqueueMock, chooseMock } = vi.hoisted(() => ({
    findBySlugMock: vi.fn(),
    enqueueMock: vi.fn(),
    chooseMock: vi.fn(),
}));

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: {
        findBySlug: (...args: unknown[]) => findBySlugMock(...args),
        findById: () => Promise.resolve(null),
    },
}));

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {
        enqueueOnCard: (...args: unknown[]) => enqueueMock(...args),
        listActiveByBoard: () => Promise.resolve([]),
        findById: () => Promise.resolve(null),
    },
}));

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: { appendAgentEvent: vi.fn() },
}));

vi.mock("@/(shared)/lib/pull-request/pull-request-open", () => ({
    ensurePullRequest: vi.fn(),
}));

vi.mock("@/(shared)/lib/orchestrator/executor", () => ({
    getStageExecutor: () => null,
}));

vi.mock("@/(shared)/lib/orchestrator/executor-choice", () => ({
    chooseExecutorFor: (...args: unknown[]) => chooseMock(...args),
    executorsForRuns: () => Promise.resolve(new Map()),
}));

const { resumeAfterAnswer } = await import(
    "@/(shared)/lib/orchestrator/orchestrator"
);

const parsed = parseBoardConfig({
    version: 1,
    name: "sample",
    specAuthoring: { runners: ["local"] },
    stages: [
        { key: "analyze", column: "Análise", command: "/analyze" },
        {
            key: "develop",
            column: "Executando",
            command: "/develop",
            runners: ["cloud"],
        },
    ],
});
if (!parsed.success) {
    throw new Error("invalid config");
}

const board = {
    id: "agent-board-demo--sample-app",
    config: parsed.data,
    stageSettings: {},
} as unknown as Parameters<typeof resumeAfterAnswer>[0]["board"];

const BY = { userId: "u1", login: "octo" };

const waitingCard = (overrides: Record<string, unknown> = {}) => ({
    id: "agent-board-demo--sample-app__search-cards",
    slug: "search-cards",
    lane: "stage",
    stageKey: "develop",
    state: "waiting_input",
    activeRunId: null,
    pendingAsk: null,
    ...overrides,
});

beforeEach(() => {
    for (const mock of [findBySlugMock, enqueueMock, chooseMock]) {
        mock.mockReset();
    }
    enqueueMock.mockResolvedValue({
        ok: false,
        code: "CARD_NOT_FOUND",
        status: 404,
    });
});

describe("resumeAfterAnswer", () => {
    it("does not queue a run when nothing of the person serves the card's stage", async () => {
        findBySlugMock.mockResolvedValue(waitingCard());
        chooseMock.mockResolvedValue({
            ok: false,
            refusal: "stage_not_served",
        });

        await resumeAfterAnswer({
            board,
            slug: "search-cards",
            by: BY,
            now: NOW,
        });

        expect(chooseMock).toHaveBeenCalledWith(
            "u1",
            NOW,
            expect.objectContaining({ key: "develop", runners: ["cloud"] })
        );
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("does not queue a run when the person has no runner online", async () => {
        findBySlugMock.mockResolvedValue(waitingCard({ stageKey: "analyze" }));
        chooseMock.mockResolvedValue({ ok: false, refusal: "no_executor" });

        await resumeAfterAnswer({
            board,
            slug: "search-cards",
            by: BY,
            now: NOW,
        });

        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("queues the card's stage again when an executor serves it", async () => {
        findBySlugMock.mockResolvedValue(waitingCard());
        chooseMock.mockResolvedValue({ ok: true, executor: "fake" });

        await resumeAfterAnswer({
            board,
            slug: "search-cards",
            by: BY,
            now: NOW,
        });

        expect(enqueueMock).toHaveBeenCalledTimes(1);
        expect(enqueueMock.mock.calls[0]?.[0]).toBe(
            "agent-board-demo--sample-app__search-cards"
        );
    });

    it("reads the runners of a draft from specAuthoring", async () => {
        findBySlugMock.mockResolvedValue(
            waitingCard({ lane: "drafts", stageKey: "spec" })
        );
        chooseMock.mockResolvedValue({ ok: false, refusal: "no_executor" });

        await resumeAfterAnswer({
            board,
            slug: "search-cards",
            by: BY,
            now: NOW,
        });

        expect(chooseMock).toHaveBeenCalledWith(
            "u1",
            NOW,
            expect.objectContaining({ runners: ["local"] })
        );
    });

    it("does not choose an executor for a card that is not waiting for an answer", async () => {
        findBySlugMock.mockResolvedValue(waitingCard({ state: "idle" }));

        await resumeAfterAnswer({
            board,
            slug: "search-cards",
            by: BY,
            now: NOW,
        });

        expect(chooseMock).not.toHaveBeenCalled();
        expect(enqueueMock).not.toHaveBeenCalled();
    });
});
