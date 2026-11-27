import {
    applyPullRequestEvent,
    isPrCommentTrigger,
    PULL_REQUEST_REVIEW_STATES,
    type PullRequestEvent,
    type PullRequestReviewState,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { boardIdForRepository } from "@/(shared)/lib/board-import";
import {
    onPullRequestComment,
    settlePullRequest,
} from "@/(shared)/lib/orchestrator/orchestrator";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import {
    checkSuiteEventSchema,
    issueCommentEventSchema,
    pullRequestEventSchema,
    pullRequestReviewEventSchema,
} from "@/(shared)/validation/github-webhook.schema";
import { appendBoardUpdate, pullRequestEventText } from "./pull-request-events";

export const PULL_REQUEST_WEBHOOK_EVENTS = [
    "pull_request",
    "pull_request_review",
    "issue_comment",
    "check_suite",
] as const;

export const isPullRequestWebhook = (event: string): boolean =>
    (PULL_REQUEST_WEBHOOK_EVENTS as readonly string[]).includes(event);

/** A webhook reduced to the cards it touches; one check suite can cover several pull requests. */
export type ParsedPullRequestWebhook = {
    repositoryFullName: string;
    installationId: number | null;
    numbers: number[];
    event: PullRequestEvent;
};

const PULL_REQUEST_ACTIONS = new Set([
    "closed",
    "reopened",
    "synchronize",
    "edited",
    "ready_for_review",
    "converted_to_draft",
]);

const asReviewState = (state: string): PullRequestReviewState | null => {
    const lowered = state.toLowerCase() as PullRequestReviewState;
    return PULL_REQUEST_REVIEW_STATES.includes(lowered) ? lowered : null;
};

function parsePullRequest(
    payload: unknown,
    at: string
): ParsedPullRequestWebhook | null | "invalid" {
    const parsed = pullRequestEventSchema.safeParse(payload);
    if (!parsed.success) {
        return "invalid";
    }
    const { action, pull_request: pr, repository, installation } = parsed.data;
    if (!PULL_REQUEST_ACTIONS.has(action)) {
        return null;
    }
    let event: PullRequestEvent;
    switch (action) {
        case "closed":
            event = {
                kind: "closed",
                merged: pr.merged === true,
                byLogin:
                    pr.merged === true && pr.merged_by
                        ? pr.merged_by.login
                        : parsed.data.sender.login,
                at,
            };
            break;
        case "synchronize":
            event = {
                kind: "synchronize",
                headSha: pr.head.sha,
                commits: pr.commits ?? null,
                at,
            };
            break;
        case "edited":
            event = { kind: "edited", title: pr.title, at };
            break;
        default:
            event = {
                kind: action as
                    | "reopened"
                    | "ready_for_review"
                    | "converted_to_draft",
                at,
            };
    }
    return {
        repositoryFullName: repository.full_name,
        installationId: installation?.id ?? null,
        numbers: [pr.number],
        event,
    };
}

function parseReview(
    payload: unknown,
    at: string
): ParsedPullRequestWebhook | null | "invalid" {
    const parsed = pullRequestReviewEventSchema.safeParse(payload);
    if (!parsed.success) {
        return "invalid";
    }
    const { action, review, pull_request: pr } = parsed.data;
    const base = {
        repositoryFullName: parsed.data.repository.full_name,
        installationId: parsed.data.installation?.id ?? null,
        numbers: [pr.number],
    };
    if (action === "dismissed") {
        return {
            ...base,
            event: { kind: "review_dismissed", login: review.user.login, at },
        };
    }
    const state = asReviewState(review.state);
    if (action !== "submitted" || state === null) {
        return null;
    }
    return {
        ...base,
        event: {
            kind: "review_submitted",
            login: review.user.login,
            state,
            hasBody: (review.body ?? "").trim().length > 0,
            at,
        },
    };
}

function parseIssueComment(
    payload: unknown,
    at: string
): ParsedPullRequestWebhook | null | "invalid" {
    const parsed = issueCommentEventSchema.safeParse(payload);
    if (!parsed.success) {
        return "invalid";
    }
    const { action, issue, comment } = parsed.data;
    // Issues and pull requests share comments; only a pull request carries `pull_request`.
    if (action !== "created" || issue.pull_request == null) {
        return null;
    }
    return {
        repositoryFullName: parsed.data.repository.full_name,
        installationId: parsed.data.installation?.id ?? null,
        numbers: [issue.number],
        event: { kind: "comment", login: comment.user.login, at },
    };
}

function parseCheckSuite(
    payload: unknown,
    at: string
): ParsedPullRequestWebhook | null | "invalid" {
    const parsed = checkSuiteEventSchema.safeParse(payload);
    if (!parsed.success) {
        return "invalid";
    }
    const suite = parsed.data.check_suite;
    if (
        parsed.data.action !== "completed" ||
        suite.pull_requests.length === 0 ||
        !suite.conclusion
    ) {
        return null;
    }
    return {
        repositoryFullName: parsed.data.repository.full_name,
        installationId: parsed.data.installation?.id ?? null,
        numbers: suite.pull_requests.map((pr) => pr.number),
        event: {
            kind: "check_suite_completed",
            app: suite.app.slug,
            name: suite.app.name ?? suite.app.slug,
            conclusion: suite.conclusion,
            headSha: suite.head_sha,
            at,
        },
    };
}

/**
 * `null` when the event does not concern a card (an action the board ignores, a comment on
 * an issue, a suite without pull requests); `"invalid"` when the payload is not the shape
 * GitHub documents.
 */
export function parsePullRequestWebhook(
    event: string,
    payload: unknown,
    now: Date
): ParsedPullRequestWebhook | null | "invalid" {
    const at = now.toISOString();
    switch (event) {
        case "pull_request":
            return parsePullRequest(payload, at);
        case "pull_request_review":
            return parseReview(payload, at);
        case "issue_comment":
            return parseIssueComment(payload, at);
        case "check_suite":
            return parseCheckSuite(payload, at);
        default:
            return null;
    }
}

export type PullRequestWebhookResult =
    | { ok: true; handled: boolean }
    | { ok: false; code: string; status: number };

async function applyToCard(
    board: NonNullable<Awaited<ReturnType<typeof boardRepository.findById>>>,
    number: number,
    event: PullRequestEvent,
    now: Date
): Promise<boolean> {
    const card = await cardRepository.findByPullRequest(board.id, number);
    if (card === null) {
        return false;
    }
    let wasOpen = false;
    const updated = await cardRepository.updatePullRequest(
        card.id,
        (stored) => {
            if (stored.pullRequest?.number !== number) {
                return null;
            }
            wasOpen = stored.pullRequest.state === "open";
            return {
                pullRequest: applyPullRequestEvent(stored.pullRequest, event),
            };
        }
    );
    if (updated === null) {
        return false;
    }
    if (event.kind === "closed") {
        // A redelivered close finds the pull request already closed: the timeline says it once.
        if (wasOpen) {
            await appendBoardUpdate(
                updated,
                event.merged
                    ? pullRequestEventText.merged(number, event.byLogin)
                    : pullRequestEventText.closed(number, event.byLogin)
            );
        }
        await settlePullRequest(board, card.id);
    } else if (isPrCommentTrigger(event)) {
        await onPullRequestComment(board, card.id, now);
    }
    return true;
}

/**
 * Applies a pull request webhook to the card whose pull request it is. The board is found
 * by repository and must belong to the installation that sent the event; the card, by the
 * pull request number among that board's cards, never by a number alone.
 */
export async function handlePullRequestWebhook(
    event: string,
    payload: unknown,
    context: { delivery: string | null; now?: Date }
): Promise<PullRequestWebhookResult> {
    const now = context.now ?? new Date();
    const parsed = parsePullRequestWebhook(event, payload, now);
    if (parsed === "invalid") {
        return {
            ok: false,
            code: "GITHUB_WEBHOOK_PAYLOAD_INVALID",
            status: HTTP_STATUS.BAD_REQUEST,
        };
    }
    if (parsed === null) {
        return { ok: true, handled: false };
    }
    try {
        const board = await boardRepository.findById(
            boardIdForRepository(parsed.repositoryFullName)
        );
        if (
            board === null ||
            parsed.installationId === null ||
            board.repository.installationId !== parsed.installationId
        ) {
            return { ok: true, handled: false };
        }
        let handled = false;
        for (const number of parsed.numbers) {
            handled =
                (await applyToCard(board, number, parsed.event, now)) ||
                handled;
        }
        return { ok: true, handled };
    } catch {
        logEvent("github", "webhook-processing-failed", {
            event,
            delivery: context.delivery,
        });
        return {
            ok: false,
            code: "GITHUB_WEBHOOK_PROCESSING_FAILED",
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        };
    }
}
