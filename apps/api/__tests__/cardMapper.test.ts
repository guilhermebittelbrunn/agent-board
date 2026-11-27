import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
    cardIdFor,
    cardMapper,
    toCardDTO,
} from "@/(shared)/mappers/card.mapper";

const AT = "2026-11-26T10:00:00.000Z";

describe("cardMapper", () => {
    it("turns Firestore timestamps into ISO strings", () => {
        const card = cardMapper.toDTO({
            id: cardIdFor("b", "search-cards"),
            boardId: "b",
            slug: "search-cards",
            title: "Busca",
            spec: {
                path: "specs/features/search-cards.md",
                sha: "abc",
                status: "approved",
            },
            ready: true,
            orphan: false,
            lane: "stage",
            stageKey: "analyze",
            state: "idle",
            reworkLoops: 0,
            order: 2,
            branch: "feat/search-cards",
            movedAt: Timestamp.fromDate(new Date(AT)),
            movedByUserId: "p1",
            syncedAt: Timestamp.fromDate(new Date(AT)),
            createdAt: Timestamp.fromDate(new Date(AT)),
            updatedAt: Timestamp.fromDate(new Date(AT)),
            deletedAt: null,
        });

        expect(card).toMatchObject({
            id: "b__search-cards",
            lane: "stage",
            stageKey: "analyze",
            movedAt: AT,
            syncedAt: AT,
            createdAt: AT,
            deletedAt: null,
        });
    });

    it("fills defaults for a document missing optional fields", () => {
        const card = cardMapper.toDTO({ id: "b__x", boardId: "b", slug: "x" });

        expect(card).toMatchObject({
            title: "x",
            ready: false,
            orphan: false,
            lane: "tasks",
            stageKey: null,
            state: "idle",
            reworkLoops: 0,
            order: 0,
            branch: null,
            activeRunId: null,
            lastRun: null,
            movedAt: null,
            movedByUserId: null,
        });
    });

    it("reads an old document as a repository card with its spec on the base branch", () => {
        const card = cardMapper.toDTO({ id: "b__x", boardId: "b", slug: "x" });

        expect(card).toMatchObject({
            origin: "repository",
            request: null,
            specApproval: null,
            spec: { ref: null },
        });
    });

    it("keeps a draft's stage key and hides the bucket path of its attachments", () => {
        const record = cardMapper.toDTO({
            id: "b__slack-alerts",
            boardId: "b",
            slug: "slack-alerts",
            lane: "drafts",
            stageKey: "spec",
            origin: "board",
            spec: {
                path: "specs/features/slack-alerts.md",
                sha: "",
                status: "",
                ref: "feat/slack-alerts",
            },
            request: {
                text: "Avisar no Slack",
                attachments: [
                    {
                        id: "3f0c9e1a-1b2c-4d5e-8f90-123456789abc",
                        name: "print.png",
                        contentType: "image/png",
                        size: 10,
                        path: "uploads/u1/3f0c9e1a-1b2c-4d5e-8f90-123456789abc.png",
                    },
                    {
                        id: "x",
                        name: "bad",
                        contentType: "application/zip",
                        path: "p",
                    },
                ],
                requestedBy: { userId: "u1", login: "octo" },
                requestedAt: Timestamp.fromDate(new Date(AT)),
            },
        });

        expect(record).toMatchObject({
            lane: "drafts",
            stageKey: "spec",
            origin: "board",
            spec: { ref: "feat/slack-alerts" },
        });
        expect(record.request?.attachments).toHaveLength(1);
        expect(record.request?.attachments[0]?.path).toContain("uploads/u1/");

        const dto = toCardDTO(record);
        expect(dto.request).toEqual({
            text: "Avisar no Slack",
            attachments: [
                {
                    id: "3f0c9e1a-1b2c-4d5e-8f90-123456789abc",
                    name: "print.png",
                    contentType: "image/png",
                    size: 10,
                },
            ],
            requestedBy: { userId: "u1", login: "octo" },
            requestedAt: AT,
        });
    });

    it("reads the live run and the last run, dropping an incomplete one", () => {
        const card = cardMapper.toDTO({
            id: "b__x",
            lane: "stage",
            stageKey: "develop",
            activeRunId: "r2",
            lastRun: {
                id: "r1",
                stageKey: "analyze",
                status: "stopped",
                outcome: null,
                endReason: "stopped",
                stoppedByLogin: "octo",
                finishedAt: Timestamp.fromDate(new Date(AT)),
            },
        });

        expect(card).toMatchObject({
            activeRunId: "r2",
            lastRun: {
                id: "r1",
                stageKey: "analyze",
                status: "stopped",
                outcome: null,
                endReason: "stopped",
                stoppedByLogin: "octo",
                finishedAt: AT,
            },
        });
        expect(
            cardMapper.toDTO({ id: "b__x", lastRun: { id: "r1" } }).lastRun
        ).toBeNull();
        expect(
            cardMapper.toDTO({
                id: "b__x",
                lastRun: { id: "r1", stageKey: "analyze", status: "exploded" },
            }).lastRun
        ).toBeNull();
    });

    it("keeps lane and stage key together", () => {
        expect(
            cardMapper.toDTO({ id: "b__x", lane: "stage", stageKey: null })
        ).toMatchObject({ lane: "tasks", stageKey: null });
        expect(
            cardMapper.toDTO({ id: "b__x", lane: "done", stageKey: "analyze" })
        ).toMatchObject({ lane: "done", stageKey: null });
    });

    it("does not send who moved the card out of the API", () => {
        const card = cardMapper.toDTO({ id: "b__x", movedByUserId: "p1" });

        expect(toCardDTO(card)).not.toHaveProperty("movedByUserId");
    });
});

describe("cardMapper pull request", () => {
    const stored = {
        number: 12,
        url: "https://github.com/acme/app/pull/12",
        title: "Busca",
        draft: true,
        state: "open",
        headRef: "feat/x",
        baseRef: "main",
        headSha: "sha-1",
        commits: 3,
        openedAt: Timestamp.fromDate(new Date(AT)),
        openedByBoard: true,
        dispatchAs: { userId: "p-secret-id", login: "octo" },
        closedAt: null,
        closedByLogin: null,
        checks: [
            {
                app: "github-actions",
                name: "CI",
                conclusion: "failure",
                headSha: "sha-1",
                at: Timestamp.fromDate(new Date(AT)),
            },
            { name: "broken" },
        ],
        reviews: [
            {
                login: "qa",
                state: "approved",
                at: Timestamp.fromDate(new Date(AT)),
            },
            { login: "bad", state: "pending" },
        ],
        commentRunsAt: [Timestamp.fromDate(new Date(AT))],
        unhandledCommentAt: Timestamp.fromDate(new Date(AT)),
    };

    it("reads an old card without pull request as null", () => {
        const card = cardMapper.toDTO({ id: "b__x", boardId: "b", slug: "x" });

        expect(card.pullRequest).toBeNull();
        expect(card.pullRequestError).toBeNull();
    });

    it("turns the timestamps into ISO and drops malformed checks and reviews", () => {
        const card = cardMapper.toDTO({
            id: "b__x",
            boardId: "b",
            slug: "x",
            pullRequest: stored,
            pullRequestError: {
                code: "GITHUB_APP_PERMISSION_MISSING",
                at: Timestamp.fromDate(new Date(AT)),
            },
        });

        expect(card.pullRequest).toMatchObject({
            openedAt: AT,
            checks: [{ app: "github-actions", at: AT }],
            reviews: [{ login: "qa", state: "approved", at: AT }],
            commentRunsAt: [AT],
            unhandledCommentAt: AT,
        });
        expect(card.pullRequest?.checks).toHaveLength(1);
        expect(card.pullRequest?.reviews).toHaveLength(1);
        expect(card.pullRequestError).toEqual({
            code: "GITHUB_APP_PERMISSION_MISSING",
            at: AT,
        });
    });

    it("keeps who runs the comments in the API and derives the summaries", () => {
        const dto = toCardDTO(
            cardMapper.toDTO({
                id: "b__x",
                boardId: "b",
                slug: "x",
                pullRequest: stored,
            })
        );

        expect(dto.pullRequest).toMatchObject({
            checksSummary: "failure",
            reviewsSummary: "approved",
            pendingComment: true,
        });
        expect(dto.pullRequest).not.toHaveProperty("dispatchAs");
        expect(dto.pullRequest).not.toHaveProperty("commentRunsAt");
        expect(dto.pullRequest).not.toHaveProperty("unhandledCommentAt");
        expect(JSON.stringify(dto)).not.toContain("p-secret-id");
    });
});
