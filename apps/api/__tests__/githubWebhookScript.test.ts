import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isValidWebhookSignature } from "@/(shared)/lib/github/github-webhook-signature";
import {
    buildWebhook,
    signWebhook,
    WEBHOOK_EVENTS,
} from "../scripts/githubWebhookPayload.mjs";

vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => null,
}));
vi.mock("@/(shared)/lib/orchestrator/orchestrator", () => ({}));
vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {},
}));
vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: {},
}));
vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: {},
}));

const { parsePullRequestWebhook } = await import(
    "@/(shared)/lib/pull-request/pull-request-webhook"
);

const NOW = new Date("2026-11-27T10:00:00.000Z");
const input = {
    fullName: "agent-board-demo/sample-app",
    pullRequest: {
        number: 12,
        title: "Busca",
        draft: true,
        commits: 3,
        headRef: "feat/search-cards",
        headSha: "sha-1",
    },
    login: "qa-pr-flow",
    app: "github-actions",
};

describe("github-webhook script payloads", () => {
    it.each(WEBHOOK_EVENTS)("builds %s in the shape the API reads", (kind) => {
        const { event, body } = buildWebhook(kind, input) as {
            event: string;
            body: unknown;
        };

        const parsed = parsePullRequestWebhook(event, body, NOW);

        expect(parsed).not.toBe("invalid");
        expect(parsed).toMatchObject({
            repositoryFullName: input.fullName,
            installationId: 1,
            numbers: [input.pullRequest.number],
        });
    });

    it("signs like GitHub", () => {
        const body = JSON.stringify({ zen: "x" });

        expect(
            isValidWebhookSignature(
                Buffer.from(body),
                signWebhook(body, "secret"),
                "secret"
            )
        ).toBe(true);
    });

    it("refuses to run outside the emulators", () => {
        const result = spawnSync(
            process.execPath,
            [
                join(__dirname, "../scripts/github-webhook.mjs"),
                "board",
                "slug",
                "merged",
            ],
            {
                env: {
                    PATH: process.env.PATH ?? "",
                } as unknown as NodeJS.ProcessEnv,
                encoding: "utf8",
            }
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Refusing to seed");
    });
});
