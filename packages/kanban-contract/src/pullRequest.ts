import type { CardLane } from "./boardLanes";
import type { RunPerson } from "./run";

export const PULL_REQUEST_STATES = ["open", "merged", "closed"] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export const PULL_REQUEST_REVIEW_STATES = [
    "approved",
    "changes_requested",
    "commented",
] as const;
export type PullRequestReviewState =
    (typeof PULL_REQUEST_REVIEW_STATES)[number];

export type PullRequestChecksSummary = "pending" | "success" | "failure";

export const MAX_PULL_REQUEST_CHECKS = 10;
export const MAX_PULL_REQUEST_REVIEWS = 20;
const ONE_HOUR_MS = 3_600_000;

/** The latest completed check suite of one GitHub App on the pull request. */
export type PullRequestCheck = {
    app: string;
    name: string;
    conclusion: string;
    headSha: string;
    at: string;
};

/** The latest review of one person. */
export type PullRequestReview = {
    login: string;
    state: PullRequestReviewState;
    at: string;
};

export type CardPullRequest = {
    number: number;
    url: string;
    title: string;
    draft: boolean;
    state: PullRequestState;
    headRef: string;
    baseRef: string;
    headSha: string | null;
    commits: number | null;
    openedAt: string;
    /** `false` when the board adopted a pull request that already existed for the branch. */
    openedByBoard: boolean;
    /** Whose executor runs the comment command. */
    dispatchAs: RunPerson;
    closedAt: string | null;
    closedByLogin: string | null;
    checks: PullRequestCheck[];
    reviews: PullRequestReview[];
    /** When the comment command started in the last hour, for the hourly limit. */
    commentRunsAt: string[];
    /** A comment that arrived while a run was live or above the limit. */
    unhandledCommentAt: string | null;
};

/** A GitHub webhook already reduced to what changes on the card. */
export type PullRequestEvent =
    | { kind: "closed"; merged: boolean; byLogin: string; at: string }
    | {
          kind: "reopened" | "ready_for_review" | "converted_to_draft";
          at: string;
      }
    | {
          kind: "synchronize";
          headSha: string;
          commits: number | null;
          at: string;
      }
    | { kind: "edited"; title: string; at: string }
    | {
          kind: "review_submitted";
          login: string;
          state: PullRequestReviewState;
          hasBody: boolean;
          at: string;
      }
    | { kind: "review_dismissed"; login: string; at: string }
    | {
          kind: "check_suite_completed";
          app: string;
          name: string;
          conclusion: string;
          headSha: string;
          at: string;
      }
    | { kind: "comment"; login: string; at: string };

const SUCCESS_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const FAILURE_CONCLUSIONS = new Set([
    "failure",
    "timed_out",
    "cancelled",
    "action_required",
    "startup_failure",
]);

function withReview(
    reviews: PullRequestReview[],
    review: PullRequestReview
): PullRequestReview[] {
    const previous = reviews.find((item) => item.login === review.login);
    // A plain comment does not take back an approval or a change request, as on GitHub.
    const state =
        review.state === "commented" &&
        previous !== undefined &&
        previous.state !== "commented"
            ? previous.state
            : review.state;
    const others = reviews.filter((item) => item.login !== review.login);
    return [...others, { ...review, state }].slice(-MAX_PULL_REQUEST_REVIEWS);
}

function withCheck(
    checks: PullRequestCheck[],
    check: PullRequestCheck
): PullRequestCheck[] {
    const others = checks.filter((item) => item.app !== check.app);
    return [...others, check].slice(-MAX_PULL_REQUEST_CHECKS);
}

export function applyPullRequestEvent(
    pullRequest: CardPullRequest,
    event: PullRequestEvent
): CardPullRequest {
    switch (event.kind) {
        case "closed":
            return {
                ...pullRequest,
                state: event.merged ? "merged" : "closed",
                closedAt: event.at,
                closedByLogin: event.byLogin,
            };
        case "reopened":
            return {
                ...pullRequest,
                state: "open",
                closedAt: null,
                closedByLogin: null,
            };
        case "ready_for_review":
            return { ...pullRequest, draft: false };
        case "converted_to_draft":
            return { ...pullRequest, draft: true };
        case "synchronize":
            return {
                ...pullRequest,
                headSha: event.headSha,
                commits: event.commits ?? pullRequest.commits,
                checks: [],
            };
        case "edited":
            return { ...pullRequest, title: event.title };
        case "review_submitted":
            return {
                ...pullRequest,
                reviews: withReview(pullRequest.reviews, {
                    login: event.login,
                    state: event.state,
                    at: event.at,
                }),
            };
        case "review_dismissed":
            return {
                ...pullRequest,
                reviews: pullRequest.reviews.filter(
                    (review) => review.login !== event.login
                ),
            };
        case "check_suite_completed":
            return {
                ...pullRequest,
                checks: withCheck(pullRequest.checks, {
                    app: event.app,
                    name: event.name,
                    conclusion: event.conclusion,
                    headSha: event.headSha,
                    at: event.at,
                }),
            };
        default:
            return pullRequest;
    }
}

/** A comment, or a review that asks for something, calls the comment command. */
export function isPrCommentTrigger(event: PullRequestEvent): boolean {
    if (event.kind === "comment") {
        return true;
    }
    return (
        event.kind === "review_submitted" &&
        (event.state !== "approved" || event.hasBody)
    );
}

/**
 * Where a closed pull request takes its card. Only a card on the pull request stage moves: a
 * pull request closed earlier stays on the card as history while it runs other stages. A live
 * run finishes first: the card moves when that run completes, so a run never ends on a card
 * that already left its stage.
 */
export function resolvePullRequestClosure(
    card: {
        lane: CardLane;
        stageKey: string | null;
        activeRunId: string | null;
        pullRequest: Pick<CardPullRequest, "state"> | null;
    },
    pullRequestStageKey: string | undefined
): { lane: "done" | "tasks" } | null {
    if (
        card.lane !== "stage" ||
        pullRequestStageKey === undefined ||
        card.stageKey !== pullRequestStageKey ||
        card.activeRunId !== null ||
        card.pullRequest === null
    ) {
        return null;
    }
    if (card.pullRequest.state === "merged") {
        return { lane: "done" };
    }
    if (card.pullRequest.state === "closed") {
        return { lane: "tasks" };
    }
    return null;
}

export function pruneCommentRuns(runsAt: string[], now: Date): string[] {
    const since = now.getTime() - ONE_HOUR_MS;
    return runsAt.filter((at) => Date.parse(at) > since);
}

export function canRunPrComment(
    runsAt: string[],
    now: Date,
    limit: number
): boolean {
    return limit > 0 && pruneCommentRuns(runsAt, now).length < limit;
}

/** Only suites of the current head count: a push makes the older results stale. */
export function summarizeChecks(
    checks: PullRequestCheck[],
    headSha: string | null
): PullRequestChecksSummary {
    const current =
        headSha === null
            ? checks
            : checks.filter((check) => check.headSha === headSha);
    if (current.some((check) => FAILURE_CONCLUSIONS.has(check.conclusion))) {
        return "failure";
    }
    if (
        current.length > 0 &&
        current.every((check) => SUCCESS_CONCLUSIONS.has(check.conclusion))
    ) {
        return "success";
    }
    return "pending";
}

export function summarizeReviews(
    reviews: PullRequestReview[]
): PullRequestReviewState | null {
    if (reviews.some((review) => review.state === "changes_requested")) {
        return "changes_requested";
    }
    if (reviews.some((review) => review.state === "approved")) {
        return "approved";
    }
    return reviews.length > 0 ? "commented" : null;
}
