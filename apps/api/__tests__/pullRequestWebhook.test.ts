import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullRequestDocument } from "@/(shared)/mappers/card.mapper";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const { cardStore, findBoardMock, appendMock, settleMock, commentMock } =
    vi.hoisted(() => ({
        cardStore: { current: null as FakeCardRepository | null },
        findBoardMock: vi.fn(),
        appendMock: vi.fn(),
        settleMock: vi.fn(),
        commentMock: vi.fn(),
    }));

// Not `importActual`: the real module reads `@/env`, which validates every variable.
vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => null,
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
    },
}));

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

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: {
        appendAgentEvent: (...args: unknown[]) => appendMock(...args),
    },
}));

vi.mock("@/(shared)/lib/orchestrator/orchestrator", () => ({
    settlePullRequest: (...args: unknown[]) => settleMock(...args),
    onPullRequestComment: (...args: unknown[]) => commentMock(...args),
}));

const { handlePullRequestWebhook, parsePullRequestWebhook } = await import(
    "@/(shared)/lib/pull-request/pull-request-webhook"
);

const BOARD_ID = "agent-board-demo--sample-app";
const NOW = new Date("2026-11-27T10:00:00.000Z");
const AT = NOW.toISOString();
const PR_NUMBER = 12;
const OTHER_PR_NUMBER = 13;
const repository = { full_name: "agent-board-demo/sample-app" };
const installation = { id: 1 };

const pullRequestPayload = (action: string, extra = {}) => ({
    action,
    number: 12,
    pull_request: {
        number: 12,
        title: "Busca",
        draft: true,
        merged: false,
        merged_by: null,
        commits: 4,
        head: { ref: "feat/search-cards", sha: "sha-2" },
        ...extra,
    },
    repository,
    installation,
    sender: { login: "closer" },
});

const reviewPayload = (state: string, body: string | null = null) => ({
    action: "submitted",
    review: { user: { login: "qa-pr-flow" }, state, body },
    pull_request: { number: 12 },
    repository,
    installation,
});

const commentPayload = (withPullRequest = true) => ({
    action: "created",
    issue: {
        number: 12,
        ...(withPullRequest ? { pull_request: { url: "x" } } : {}),
    },
    comment: { user: { login: "reviewer" } },
    repository,
    installation,
});

const checkSuitePayload = (
    conclusion: string | null,
    numbers = [PR_NUMBER]
) => ({
    action: "completed",
    check_suite: {
        head_sha: "sha-1",
        conclusion,
        app: { slug: "github-actions", name: "GitHub Actions" },
        pull_requests: numbers.map((number) => ({ number })),
    },
    repository,
    installation,
});

describe("parsePullRequestWebhook", () => {
    const parse = (event: string, payload: unknown) =>
        parsePullRequestWebhook(event, payload, NOW);

    it("reads a merge with who merged it", () => {
        expect(
            parse(
                "pull_request",
                pullRequestPayload("closed", {
                    merged: true,
                    merged_by: { login: "merger" },
                })
            )
        ).toEqual({
            repositoryFullName: "agent-board-demo/sample-app",
            installationId: 1,
            numbers: [PR_NUMBER],
            event: { kind: "closed", merged: true, byLogin: "merger", at: AT },
        });
    });

    it("reads a close without merge with the sender", () => {
        expect(
            parse("pull_request", pullRequestPayload("closed"))
        ).toMatchObject({
            event: { kind: "closed", merged: false, byLogin: "closer" },
        });
    });

    it.each([
        ["synchronize", { kind: "synchronize", headSha: "sha-2", commits: 4 }],
        ["edited", { kind: "edited", title: "Busca" }],
        ["reopened", { kind: "reopened" }],
        ["ready_for_review", { kind: "ready_for_review" }],
        ["converted_to_draft", { kind: "converted_to_draft" }],
    ])("reads pull_request.%s", (action, event) => {
        expect(parse("pull_request", pullRequestPayload(action))).toMatchObject(
            { event }
        );
    });

    it("ignores the pull request actions the board does not use", () => {
        expect(parse("pull_request", pullRequestPayload("labeled"))).toBeNull();
    });

    it("reads reviews in lower case, with or without a body", () => {
        expect(
            parse("pull_request_review", reviewPayload("APPROVED"))
        ).toMatchObject({
            event: {
                kind: "review_submitted",
                login: "qa-pr-flow",
                state: "approved",
                hasBody: false,
            },
        });
        expect(
            parse(
                "pull_request_review",
                reviewPayload("changes_requested", "Fix it")
            )
        ).toMatchObject({
            event: { state: "changes_requested", hasBody: true },
        });
        expect(
            parse("pull_request_review", {
                ...reviewPayload("dismissed"),
                action: "dismissed",
            })
        ).toMatchObject({
            event: { kind: "review_dismissed", login: "qa-pr-flow" },
        });
    });

    it("reads a pull request comment and ignores an issue comment", () => {
        expect(parse("issue_comment", commentPayload())).toMatchObject({
            numbers: [PR_NUMBER],
            event: { kind: "comment", login: "reviewer" },
        });
        expect(parse("issue_comment", commentPayload(false))).toBeNull();
    });

    it("reads a completed suite for every pull request it covers", () => {
        expect(
            parse(
                "check_suite",
                checkSuitePayload("failure", [PR_NUMBER, OTHER_PR_NUMBER])
            )
        ).toMatchObject({
            numbers: [PR_NUMBER, OTHER_PR_NUMBER],
            event: {
                kind: "check_suite_completed",
                app: "github-actions",
                name: "GitHub Actions",
                conclusion: "failure",
                headSha: "sha-1",
            },
        });
        expect(
            parse("check_suite", checkSuitePayload("success", []))
        ).toBeNull();
        expect(parse("check_suite", checkSuitePayload(null))).toBeNull();
    });

    it("answers invalid for a payload out of shape", () => {
        expect(parse("pull_request", { action: "closed" })).toBe("invalid");
        expect(parse("check_suite", { action: "completed" })).toBe("invalid");
    });
});

describe("handlePullRequestWebhook", () => {
    let cards: FakeCardRepository;

    const board = {
        id: BOARD_ID,
        repository: {
            installationId: 1,
            owner: "agent-board-demo",
            name: "sample-app",
            fullName: "agent-board-demo/sample-app",
        },
    };

    const seedWithPullRequest = (extra: Record<string, unknown> = {}) =>
        cards.seed(BOARD_ID, "search-cards", {
            lane: "stage",
            stageKey: "pr",
            state: "idle",
            pullRequest: pullRequestDocument({
                number: 12,
                url: "https://github.com/agent-board-demo/sample-app/pull/12",
                title: "Busca",
                draft: true,
                state: "open",
                headRef: "feat/search-cards",
                baseRef: "main",
                headSha: "sha-1",
                commits: 3,
                openedAt: AT,
                openedByBoard: true,
                dispatchAs: { userId: "p-owner", login: "octo" },
                closedAt: null,
                closedByLogin: null,
                checks: [],
                reviews: [],
                commentRunsAt: [],
                unhandledCommentAt: null,
            }),
            ...extra,
        });

    const handle = (event: string, payload: unknown) =>
        handlePullRequestWebhook(event, payload, {
            delivery: "d-1",
            now: NOW,
        });

    beforeEach(() => {
        cards = createFakeCardRepository();
        cardStore.current = cards;
        for (const mock of [
            findBoardMock,
            appendMock,
            settleMock,
            commentMock,
        ]) {
            mock.mockReset();
        }
        findBoardMock.mockResolvedValue(board);
        appendMock.mockResolvedValue({ ok: true });
    });

    it("records a merge, writes it on the timeline and settles the card", async () => {
        const id = seedWithPullRequest();

        const result = await handle(
            "pull_request",
            pullRequestPayload("closed", {
                merged: true,
                merged_by: { login: "merger" },
            })
        );

        expect(result).toEqual({ ok: true, handled: true });
        const card = await cards.repository.findById(id);
        expect(card?.pullRequest).toMatchObject({
            state: "merged",
            closedByLogin: "merger",
        });
        expect(appendMock.mock.calls[0][1].markdown).toBe(
            "PR #12 mergeada por @merger."
        );
        expect(settleMock).toHaveBeenCalledWith(board, id);
        expect(commentMock).not.toHaveBeenCalled();
    });

    it("writes a close without merge on the timeline", async () => {
        seedWithPullRequest();

        await handle("pull_request", pullRequestPayload("closed"));

        expect(appendMock.mock.calls[0][1].markdown).toBe(
            "PR #12 fechada sem merge por @closer."
        );
    });

    it("writes a redelivered close on the timeline once and still settles the card", async () => {
        const id = seedWithPullRequest();
        const merge = pullRequestPayload("closed", {
            merged: true,
            merged_by: { login: "merger" },
        });

        await handle("pull_request", merge);
        const result = await handle("pull_request", merge);

        expect(result).toEqual({ ok: true, handled: true });
        expect(appendMock).toHaveBeenCalledTimes(1);
        expect(settleMock).toHaveBeenCalledTimes(2);
        expect(settleMock).toHaveBeenLastCalledWith(board, id);
    });

    it("runs the comment command on a comment and on a change request", async () => {
        const id = seedWithPullRequest();

        await handle("issue_comment", commentPayload());
        await handle("pull_request_review", reviewPayload("changes_requested"));

        expect(commentMock).toHaveBeenCalledTimes(2);
        expect(commentMock).toHaveBeenCalledWith(board, id, NOW);
        const card = await cards.repository.findById(id);
        expect(card?.pullRequest?.reviews).toEqual([
            { login: "qa-pr-flow", state: "changes_requested", at: AT },
        ]);
    });

    it("only records an approval without text", async () => {
        const id = seedWithPullRequest();

        await handle("pull_request_review", reviewPayload("approved"));

        expect(commentMock).not.toHaveBeenCalled();
        expect(
            (await cards.repository.findById(id))?.pullRequest?.reviews[0]
                ?.state
        ).toBe("approved");
    });

    it("records a check suite", async () => {
        const id = seedWithPullRequest();

        await handle("check_suite", checkSuitePayload("failure"));

        expect(
            (await cards.repository.findById(id))?.pullRequest?.checks
        ).toEqual([
            {
                app: "github-actions",
                name: "GitHub Actions",
                conclusion: "failure",
                headSha: "sha-1",
                at: AT,
            },
        ]);
    });

    it("ignores an event from another installation", async () => {
        const id = seedWithPullRequest();

        const result = await handle("pull_request", {
            ...pullRequestPayload("closed"),
            installation: { id: 99 },
        });

        expect(result).toEqual({ ok: true, handled: false });
        expect((await cards.repository.findById(id))?.pullRequest?.state).toBe(
            "open"
        );
    });

    it("ignores a repository without a board and a pull request without a card", async () => {
        findBoardMock.mockResolvedValueOnce(null);
        expect(
            await handle("pull_request", pullRequestPayload("closed"))
        ).toEqual({ ok: true, handled: false });

        expect(
            await handle("pull_request", pullRequestPayload("closed"))
        ).toEqual({ ok: true, handled: false });
    });

    it("answers 400 for a payload out of shape", async () => {
        expect(await handle("pull_request", { action: "closed" })).toEqual({
            ok: false,
            code: "GITHUB_WEBHOOK_PAYLOAD_INVALID",
            status: 400,
        });
    });

    it("answers 503 when the card cannot be written", async () => {
        seedWithPullRequest();
        findBoardMock.mockRejectedValue(new Error("firestore down"));

        expect(
            await handle("pull_request", pullRequestPayload("closed"))
        ).toEqual({
            ok: false,
            code: "GITHUB_WEBHOOK_PROCESSING_FAILED",
            status: 503,
        });
    });
});
