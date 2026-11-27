import { type CardPullRequest, parseBoardConfig } from "@repo/kanban-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import type { TriggerPlan } from "@/(shared)/lib/orchestrator/decide";
import {
    type CardRecord,
    pullRequestDocument,
} from "@/(shared)/mappers/card.mapper";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const { cardStore, calls, appendMock, ensureMock, finishMock } = vi.hoisted(
    () => ({
        cardStore: { current: null as FakeCardRepository | null },
        calls: [] as string[],
        appendMock: vi.fn(),
        ensureMock: vi.fn(),
        finishMock: vi.fn(),
    })
);

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: new Proxy(
        {},
        {
            get: (_target, property: string) =>
                (
                    cardStore.current?.repository as unknown as Record<
                        string,
                        unknown
                    >
                )[property],
        }
    ),
}));

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {
        enqueueOnCard: async (
            cardId: string,
            plan: (card: CardRecord | null) => TriggerPlan
        ) => {
            const store = cardStore.current as FakeCardRepository;
            const decided = plan(await store.repository.findById(cardId));
            if (!decided.ok) {
                return decided;
            }
            store.documents.set(cardId, {
                ...store.documents.get(cardId),
                ...decided.card,
                activeRunId: "run-new",
            });
            calls.push(`enqueue:${decided.run.command}`);
            return { ok: true, cardId, runId: "run-new" };
        },
        finishOnCard: (...args: unknown[]) => finishMock(...args),
        listActiveByBoard: () => {
            calls.push("pump");
            return Promise.resolve([]);
        },
        findById: () => Promise.resolve({ id: "run-new" }),
    },
}));

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: {
        appendAgentEvent: (...args: unknown[]) => appendMock(...args),
    },
}));

vi.mock("@/(shared)/lib/pull-request/pull-request-open", () => ({
    ensurePullRequest: (...args: unknown[]) => {
        calls.push("ensure");
        return ensureMock(...args);
    },
}));

vi.mock("@/(shared)/lib/orchestrator/executor", () => ({
    getStageExecutor: () => null,
}));

vi.mock("@/(shared)/lib/orchestrator/executor-choice", () => ({
    executorsForRuns: () => Promise.resolve(new Map()),
    chooseExecutorFor: vi.fn(),
}));

const { completeRun, onPullRequestComment, settlePullRequest, triggerStage } =
    await import("@/(shared)/lib/orchestrator/orchestrator");

const BOARD_ID = "agent-board-demo--sample-app";
const NOW = new Date("2026-11-27T10:00:00.000Z");
const OCTO = { userId: "p-owner", login: "octo" };
const config = (() => {
    const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
    if (!parsed.success) {
        throw new Error("sample config is invalid");
    }
    return parsed.data;
})();
const board = {
    id: BOARD_ID,
    config,
    stageSettings: {},
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
};

const pullRequest = (
    extra: Partial<CardPullRequest> = {}
): CardPullRequest => ({
    number: 12,
    url: "https://github.com/agent-board-demo/sample-app/pull/12",
    title: "Busca",
    draft: true,
    state: "open",
    headRef: "feat/search-cards",
    baseRef: "main",
    headSha: "sha-1",
    commits: 3,
    openedAt: "2026-11-27T09:00:00.000Z",
    openedByBoard: true,
    dispatchAs: OCTO,
    closedAt: null,
    closedByLogin: null,
    checks: [],
    reviews: [],
    commentRunsAt: [],
    unhandledCommentAt: null,
    ...extra,
});

let cards: FakeCardRepository;

const seed = (
    slug: string,
    extra: Record<string, unknown> = {},
    pr: CardPullRequest | null = pullRequest()
) =>
    cards.seed(BOARD_ID, slug, {
        lane: "stage",
        stageKey: "pr",
        state: "idle",
        activeRunId: null,
        pullRequest: pr === null ? null : pullRequestDocument(pr),
        ...extra,
    });

beforeEach(() => {
    cards = createFakeCardRepository();
    cardStore.current = cards;
    calls.length = 0;
    for (const mock of [appendMock, ensureMock, finishMock]) {
        mock.mockReset();
    }
    appendMock.mockResolvedValue({ ok: true });
    ensureMock.mockResolvedValue({ ok: true });
});

describe("settlePullRequest", () => {
    it("takes a merged card to Done, moved by the board", async () => {
        const id = seed("search-cards", {}, pullRequest({ state: "merged" }));

        await settlePullRequest(board, id);

        const card = await cards.repository.findById(id);
        expect(card).toMatchObject({ lane: "done", movedByUserId: null });
    });

    it("takes a card closed without merge to the end of Tasks", async () => {
        cards.seed(BOARD_ID, "other", { order: 4 });
        const id = seed("search-cards", {}, pullRequest({ state: "closed" }));

        await settlePullRequest(board, id);

        expect(await cards.repository.findById(id)).toMatchObject({
            lane: "tasks",
            order: 5,
        });
    });

    it("waits for a live run", async () => {
        const id = seed(
            "search-cards",
            { activeRunId: "run-1" },
            pullRequest({ state: "merged" })
        );

        await settlePullRequest(board, id);

        expect((await cards.repository.findById(id))?.lane).toBe("stage");
    });
});

describe("onPullRequestComment", () => {
    it("queues /mediate as the person who opened the stage", async () => {
        const id = seed("search-cards");

        await onPullRequestComment(board, id, NOW);

        expect(calls).toContain("enqueue:/mediate");
        const card = await cards.repository.findById(id);
        expect(card?.pullRequest?.commentRunsAt).toEqual([NOW.toISOString()]);
        expect(card?.state).toBe("queued");
    });

    it("keeps the comment waiting while a run is live", async () => {
        const id = seed("search-cards", { activeRunId: "run-1" });

        await onPullRequestComment(board, id, NOW);

        expect(calls).not.toContain("enqueue:/mediate");
        expect(
            (await cards.repository.findById(id))?.pullRequest
                ?.unhandledCommentAt
        ).toBe(NOW.toISOString());
        expect(appendMock).not.toHaveBeenCalled();
    });

    it("writes the limit on the timeline once and keeps the comment waiting", async () => {
        const id = seed(
            "search-cards",
            {},
            pullRequest({
                commentRunsAt: [
                    "2026-11-27T09:10:00.000Z",
                    "2026-11-27T09:20:00.000Z",
                    "2026-11-27T09:30:00.000Z",
                ],
            })
        );

        await onPullRequestComment(board, id, NOW);
        await onPullRequestComment(board, id, NOW);

        expect(calls).not.toContain("enqueue:/mediate");
        expect(appendMock).toHaveBeenCalledTimes(1);
        expect(appendMock.mock.calls[0][1].markdown).toContain(
            "Limite de 3 /mediate por hora"
        );
    });

    it("does nothing when the board turned the comment runs off", async () => {
        const id = seed("search-cards");

        await onPullRequestComment(
            {
                ...board,
                config: {
                    ...config,
                    limits: { ...config.limits, maxPrCommentRunsPerHour: 0 },
                },
            },
            id,
            NOW
        );

        expect(calls).toEqual([]);
        expect(
            (await cards.repository.findById(id))?.pullRequest
                ?.unhandledCommentAt
        ).toBeNull();
    });
});

describe("triggerStage", () => {
    it("opens the pull request when a person sends the card straight to the pull request stage", async () => {
        seed("search-cards", { lane: "tasks", stageKey: null }, null);

        await triggerStage({
            board,
            slug: "search-cards",
            stageKey: "pr",
            by: OCTO,
            now: NOW,
        });

        expect(calls).toEqual(["enqueue:/observe", "ensure", "pump"]);
        expect(ensureMock).toHaveBeenCalledWith(
            expect.objectContaining({ board, dispatchAs: OCTO, now: NOW })
        );
    });

    it("does not open a pull request for an earlier stage", async () => {
        seed("search-cards", { lane: "tasks", stageKey: null }, null);

        await triggerStage({
            board,
            slug: "search-cards",
            stageKey: "test",
            by: OCTO,
            now: NOW,
        });

        expect(ensureMock).not.toHaveBeenCalled();
    });
});

describe("completeRun", () => {
    it("opens the pull request before the stage command starts, then settles", async () => {
        const id = seed("search-cards", { stageKey: "test" }, null);
        finishMock.mockResolvedValue({
            ignored: false,
            cardId: id,
            nextRunId: "run-pr",
            next: {
                id: "run-pr",
                stageKey: "pr",
                trigger: "transition",
                triggeredBy: OCTO,
            },
        });

        await completeRun({
            board,
            runId: "run-test",
            outcome: "success",
            endReason: "agent",
            now: NOW,
        });

        expect(calls).toEqual(["ensure", "pump"]);
        expect(ensureMock).toHaveBeenCalledWith({
            board,
            cardId: id,
            dispatchAs: OCTO,
            now: NOW,
        });
    });

    it("does not open a pull request for the next comment run", async () => {
        const id = seed("search-cards");
        finishMock.mockResolvedValue({
            ignored: false,
            cardId: id,
            nextRunId: "run-mediate",
            next: {
                id: "run-mediate",
                stageKey: "pr",
                trigger: "pr_comment",
                triggeredBy: OCTO,
            },
        });

        await completeRun({
            board,
            runId: "run-observe",
            outcome: "success",
            endReason: "agent",
            now: NOW,
        });

        expect(ensureMock).not.toHaveBeenCalled();
    });

    it("moves a card merged during the run once the run ends", async () => {
        const id = seed("search-cards", {}, pullRequest({ state: "merged" }));
        finishMock.mockResolvedValue({
            ignored: false,
            cardId: id,
            nextRunId: null,
            next: null,
        });

        await completeRun({
            board,
            runId: "run-observe",
            outcome: "success",
            endReason: "agent",
            now: NOW,
        });

        expect((await cards.repository.findById(id))?.lane).toBe("done");
    });

    it.each([
        ["closed", "failed"],
        ["merged", "needs_input"],
    ] as const)(
        "keeps a card whose pull request was %s earlier on the stage it runs now",
        async (state, outcome) => {
            const id = seed(
                "search-cards",
                { stageKey: "develop", state: "failed" },
                pullRequest({ state })
            );
            finishMock.mockResolvedValue({
                ignored: false,
                cardId: id,
                nextRunId: null,
                next: null,
            });

            await completeRun({
                board,
                runId: "run-develop",
                outcome,
                endReason: "agent",
                now: NOW,
            });

            expect(await cards.repository.findById(id)).toMatchObject({
                lane: "stage",
                stageKey: "develop",
                state: "failed",
            });
        }
    );

    it("never fails because opening the pull request crashed", async () => {
        const id = seed("search-cards", { stageKey: "test" }, null);
        ensureMock.mockRejectedValue(new Error("firestore down"));
        finishMock.mockResolvedValue({
            ignored: false,
            cardId: id,
            nextRunId: "run-pr",
            next: {
                id: "run-pr",
                stageKey: "pr",
                trigger: "transition",
                triggeredBy: OCTO,
            },
        });
        vi.spyOn(console, "warn").mockImplementation(() => {
            // logged on purpose
        });

        await expect(
            completeRun({
                board,
                runId: "run-test",
                outcome: "success",
                endReason: "agent",
                now: NOW,
            })
        ).resolves.toEqual({ ignored: false });
    });
});
