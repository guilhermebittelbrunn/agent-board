import { describe, expect, it } from "vitest";
import {
    applyPullRequestEvent,
    type CardPullRequest,
    canRunPrComment,
    isPrCommentTrigger,
    MAX_PULL_REQUEST_CHECKS,
    MAX_PULL_REQUEST_REVIEWS,
    pruneCommentRuns,
    resolvePullRequestClosure,
    summarizeChecks,
    summarizeReviews,
} from "../src/pullRequest";

const AT = "2026-11-27T10:00:00.000Z";

const EXTRA = 3;

const pullRequest = (
    extra: Partial<CardPullRequest> = {}
): CardPullRequest => ({
    number: 12,
    url: "https://github.com/acme/app/pull/12",
    title: "Login",
    draft: true,
    state: "open",
    headRef: "feat/login",
    baseRef: "main",
    headSha: "sha-1",
    commits: 3,
    openedAt: AT,
    openedByBoard: true,
    dispatchAs: { userId: "u1", login: "octo" },
    closedAt: null,
    closedByLogin: null,
    checks: [],
    reviews: [],
    commentRunsAt: [],
    unhandledCommentAt: null,
    ...extra,
});

describe("resolvePullRequestClosure", () => {
    const card = (
        state: CardPullRequest["state"],
        activeRunId: string | null = null,
        stageKey: string | null = "pr"
    ) => ({
        lane: "stage" as const,
        stageKey,
        activeRunId,
        pullRequest: { state },
    });

    it("takes a merged card to Done and a closed one back to Tasks", () => {
        expect(resolvePullRequestClosure(card("merged"), "pr")).toEqual({
            lane: "done",
        });
        expect(resolvePullRequestClosure(card("closed"), "pr")).toEqual({
            lane: "tasks",
        });
    });

    it("waits for a live run and leaves an open pull request alone", () => {
        expect(
            resolvePullRequestClosure(card("merged", "run-1"), "pr")
        ).toBeNull();
        expect(resolvePullRequestClosure(card("open"), "pr")).toBeNull();
    });

    it("leaves a card that already left the stage columns", () => {
        expect(
            resolvePullRequestClosure(
                {
                    lane: "tasks",
                    stageKey: null,
                    activeRunId: null,
                    pullRequest: { state: "merged" },
                },
                "pr"
            )
        ).toBeNull();
    });

    it("leaves a card on another stage, whose pull request is history", () => {
        expect(
            resolvePullRequestClosure(card("closed", null, "develop"), "pr")
        ).toBeNull();
        expect(
            resolvePullRequestClosure(card("merged", null, "develop"), "pr")
        ).toBeNull();
        expect(resolvePullRequestClosure(card("merged"), undefined)).toBeNull();
    });
});

describe("comment runs limit", () => {
    const now = new Date("2026-11-27T12:00:00.000Z");
    const runs = [
        "2026-11-27T10:30:00.000Z",
        "2026-11-27T11:10:00.000Z",
        "2026-11-27T11:50:00.000Z",
    ];

    it("only counts the last hour", () => {
        expect(pruneCommentRuns(runs, now)).toEqual(runs.slice(1));
        expect(canRunPrComment(runs, now, runs.length)).toBe(true);
        expect(canRunPrComment(runs, now, 2)).toBe(false);
    });

    it("never runs with the limit at 0", () => {
        expect(canRunPrComment([], now, 0)).toBe(false);
    });
});

describe("summarizeChecks", () => {
    const check = (app: string, conclusion: string, headSha = "sha-1") => ({
        app,
        name: app,
        conclusion,
        headSha,
        at: AT,
    });

    it("is pending without a completed suite of the current head", () => {
        expect(summarizeChecks([], "sha-1")).toBe("pending");
        expect(summarizeChecks([check("ci", "failure", "old")], "sha-1")).toBe(
            "pending"
        );
    });

    it("fails when any suite failed", () => {
        expect(
            summarizeChecks(
                [check("ci", "success"), check("lint", "failure")],
                "sha-1"
            )
        ).toBe("failure");
    });

    it("succeeds when every suite succeeded, was neutral or skipped", () => {
        expect(
            summarizeChecks(
                [
                    check("ci", "success"),
                    check("lint", "neutral"),
                    check("x", "skipped"),
                ],
                "sha-1"
            )
        ).toBe("success");
    });
});

describe("summarizeReviews", () => {
    it("lets a change request win over an approval", () => {
        expect(summarizeReviews([])).toBeNull();
        expect(
            summarizeReviews([
                { login: "a", state: "approved", at: AT },
                { login: "b", state: "changes_requested", at: AT },
            ])
        ).toBe("changes_requested");
        expect(
            summarizeReviews([{ login: "a", state: "approved", at: AT }])
        ).toBe("approved");
        expect(
            summarizeReviews([{ login: "a", state: "commented", at: AT }])
        ).toBe("commented");
    });
});

describe("applyPullRequestEvent", () => {
    it("records a merge and a close with who did it", () => {
        expect(
            applyPullRequestEvent(pullRequest(), {
                kind: "closed",
                merged: true,
                byLogin: "x",
                at: AT,
            })
        ).toMatchObject({ state: "merged", closedAt: AT, closedByLogin: "x" });
        expect(
            applyPullRequestEvent(pullRequest(), {
                kind: "closed",
                merged: false,
                byLogin: "y",
                at: AT,
            })
        ).toMatchObject({ state: "closed", closedByLogin: "y" });
    });

    it("reopens, toggles the draft and renames", () => {
        const closed = pullRequest({
            state: "closed",
            closedAt: AT,
            closedByLogin: "y",
        });
        expect(
            applyPullRequestEvent(closed, { kind: "reopened", at: AT })
        ).toMatchObject({
            state: "open",
            closedAt: null,
            closedByLogin: null,
        });
        expect(
            applyPullRequestEvent(pullRequest(), {
                kind: "ready_for_review",
                at: AT,
            }).draft
        ).toBe(false);
        expect(
            applyPullRequestEvent(pullRequest({ draft: false }), {
                kind: "converted_to_draft",
                at: AT,
            }).draft
        ).toBe(true);
        expect(
            applyPullRequestEvent(pullRequest(), {
                kind: "edited",
                title: "New",
                at: AT,
            }).title
        ).toBe("New");
    });

    it("drops the checks of the old head on a push", () => {
        const next = applyPullRequestEvent(
            pullRequest({
                checks: [
                    {
                        app: "ci",
                        name: "CI",
                        conclusion: "failure",
                        headSha: "sha-1",
                        at: AT,
                    },
                ],
            }),
            { kind: "synchronize", headSha: "sha-2", commits: 4, at: AT }
        );
        expect(next).toMatchObject({
            headSha: "sha-2",
            commits: 4,
            checks: [],
        });
    });

    it("keeps one review per person and removes a dismissed one", () => {
        let current = applyPullRequestEvent(pullRequest(), {
            kind: "review_submitted",
            login: "a",
            state: "approved",
            hasBody: false,
            at: AT,
        });
        current = applyPullRequestEvent(current, {
            kind: "review_submitted",
            login: "a",
            state: "commented",
            hasBody: true,
            at: AT,
        });
        expect(current.reviews).toEqual([
            { login: "a", state: "approved", at: AT },
        ]);
        current = applyPullRequestEvent(current, {
            kind: "review_submitted",
            login: "a",
            state: "changes_requested",
            hasBody: true,
            at: AT,
        });
        expect(current.reviews[0]?.state).toBe("changes_requested");
        expect(
            applyPullRequestEvent(current, {
                kind: "review_dismissed",
                login: "a",
                at: AT,
            }).reviews
        ).toEqual([]);
    });

    it("keeps one check per app and caps checks and reviews", () => {
        let current = pullRequest();
        for (
            let index = 0;
            index < MAX_PULL_REQUEST_CHECKS + EXTRA;
            index += 1
        ) {
            current = applyPullRequestEvent(current, {
                kind: "check_suite_completed",
                app: `app-${index}`,
                name: "CI",
                conclusion: "success",
                headSha: "sha-1",
                at: AT,
            });
        }
        current = applyPullRequestEvent(current, {
            kind: "check_suite_completed",
            app: "app-12",
            name: "CI",
            conclusion: "failure",
            headSha: "sha-1",
            at: AT,
        });
        expect(current.checks).toHaveLength(MAX_PULL_REQUEST_CHECKS);
        expect(current.checks.at(-1)).toMatchObject({
            app: "app-12",
            conclusion: "failure",
        });

        for (
            let index = 0;
            index < MAX_PULL_REQUEST_REVIEWS + EXTRA;
            index += 1
        ) {
            current = applyPullRequestEvent(current, {
                kind: "review_submitted",
                login: `p-${index}`,
                state: "commented",
                hasBody: true,
                at: AT,
            });
        }
        expect(current.reviews).toHaveLength(MAX_PULL_REQUEST_REVIEWS);
    });

    it("changes nothing on a comment", () => {
        const current = pullRequest();
        expect(
            applyPullRequestEvent(current, {
                kind: "comment",
                login: "a",
                at: AT,
            })
        ).toBe(current);
    });
});

describe("isPrCommentTrigger", () => {
    it("runs on comments and on reviews that ask for something", () => {
        expect(
            isPrCommentTrigger({ kind: "comment", login: "a", at: AT })
        ).toBe(true);
        const review = (
            state: "approved" | "changes_requested" | "commented",
            hasBody: boolean
        ) =>
            isPrCommentTrigger({
                kind: "review_submitted",
                login: "a",
                state,
                hasBody,
                at: AT,
            });
        expect(review("approved", false)).toBe(false);
        expect(review("approved", true)).toBe(true);
        expect(review("changes_requested", false)).toBe(true);
        expect(isPrCommentTrigger({ kind: "ready_for_review", at: AT })).toBe(
            false
        );
    });
});
