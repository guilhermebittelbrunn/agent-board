/**
 * Builds the GitHub webhook bodies the board handles, signed like GitHub signs them, so the
 * pull request flow can be exercised on the emulator without a GitHub App.
 */
import { createHmac, randomUUID } from "node:crypto";

export const WEBHOOK_EVENTS = [
    "merged",
    "closed",
    "reopened",
    "comment",
    "review-approved",
    "review-changes",
    "checks-success",
    "checks-failure",
    "synchronize",
];

const SAMPLE_INSTALLATION_ID = 1;

/**
 * `pullRequest` is the card's stored pull request; `login` signs the action and `app` names
 * the check suite, so two suites from different apps can be told apart.
 */
export function buildWebhook(kind, { fullName, pullRequest, login, app }) {
    const repository = { full_name: fullName };
    const installation = { id: SAMPLE_INSTALLATION_ID };
    const pr = {
        number: pullRequest.number,
        title: pullRequest.title,
        draft: pullRequest.draft,
        commits: pullRequest.commits ?? 1,
        head: { ref: pullRequest.headRef, sha: pullRequest.headSha ?? "0" },
        merged: false,
        merged_by: null,
    };
    const pullRequestEvent = (action, extra = {}) => ({
        event: "pull_request",
        body: {
            action,
            number: pr.number,
            pull_request: { ...pr, ...extra },
            repository,
            installation,
            sender: { login },
        },
    });
    const review = (state, body) => ({
        event: "pull_request_review",
        body: {
            action: "submitted",
            review: { user: { login }, state, body },
            pull_request: { number: pr.number },
            repository,
            installation,
        },
    });
    const checks = (conclusion) => ({
        event: "check_suite",
        body: {
            action: "completed",
            check_suite: {
                head_sha: pr.head.sha,
                conclusion,
                app: { slug: app, name: app },
                pull_requests: [{ number: pr.number }],
            },
            repository,
            installation,
        },
    });

    switch (kind) {
        case "merged":
            return pullRequestEvent("closed", {
                merged: true,
                merged_by: { login },
            });
        case "closed":
            return pullRequestEvent("closed");
        case "reopened":
            return pullRequestEvent("reopened");
        case "synchronize":
            return pullRequestEvent("synchronize", {
                head: {
                    ref: pr.head.ref,
                    sha: randomUUID().replaceAll("-", ""),
                },
                commits: pr.commits + 1,
            });
        case "comment":
            return {
                event: "issue_comment",
                body: {
                    action: "created",
                    issue: {
                        number: pr.number,
                        pull_request: { url: "https://api.github.com" },
                    },
                    comment: { user: { login } },
                    repository,
                    installation,
                },
            };
        case "review-approved":
            return review("approved", null);
        case "review-changes":
            return review("changes_requested", "Please change this.");
        case "checks-success":
            return checks("success");
        case "checks-failure":
            return checks("failure");
        default:
            return null;
    }
}

export const signWebhook = (body, secret) =>
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
