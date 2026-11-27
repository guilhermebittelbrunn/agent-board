import { randomUUID } from "node:crypto";
import { parseBoardConfig } from "@repo/kanban-contract";
import type { BoardDTO } from "@repo/sdk/src/types";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// No GitHub App variables: against the emulator the board answers with the sample client.
vi.mock("@/env", () => ({ env: {} }));

const { getFirestoreAdmin } = await import("@repo/auth/server");
const { SAMPLE_BOARD_CONFIGS } = await import(
    "@/(shared)/lib/github/github-sample-repositories"
);
const { boardMapper } = await import("@/(shared)/mappers/board.mapper");
const { cardRepository } = await import(
    "@/(shared)/repositories/card.repository"
);
const { runRepository } = await import(
    "@/(shared)/repositories/run.repository"
);
const { applyPullRequestEvent } = await import("@repo/kanban-contract");
const { completeRun, settlePullRequest, stopRun, tick, triggerStage } =
    await import("@/(shared)/lib/orchestrator/orchestrator");
const { FAKE_RUN_DURATION_MS } = await import(
    "@/(shared)/lib/orchestrator/fake-executor"
);
const { createCycle } = await import("@/(shared)/lib/orchestrator/cycle");
const { cycleRepository } = await import(
    "@/(shared)/repositories/cycle.repository"
);

const RUN_ID = randomUUID();
const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
if (!parsed.success) {
    throw new Error("sample config is invalid");
}
const config = parsed.data;
const OCTO = { userId: "p-owner", login: "octo" };
const usedBoards: string[] = [];
let boardCount = 0;

const db = () => getFirestoreAdmin();

async function createBoard(
    stageSettings: BoardDTO["stageSettings"] = {}
): Promise<BoardDTO> {
    boardCount += 1;
    const id = `emu-orchestrator-${RUN_ID}-${boardCount}`;
    usedBoards.push(id);
    const at = new Date("2026-11-26T09:00:00.000Z");
    const document = {
        ownerUserId: OCTO.userId,
        ownerGithubId: "1",
        name: "sample-app",
        repository: {
            installationId: 1,
            owner: "agent-board-demo",
            name: "sample-app",
            fullName: "agent-board-demo/sample-app",
            defaultBranch: "main",
            private: false,
        },
        config,
        configSource: {
            path: ".kanban/board.yml",
            ref: "main",
            sha: "x",
            readAt: at,
        },
        stageSettings,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
    };
    await db().collection("board").doc(id).set(document);
    return boardMapper.toDTO({ id, ...document });
}

async function createCard(boardId: string, slug: string): Promise<string> {
    const id = `${boardId}__${slug}`;
    const at = new Date("2026-11-26T09:00:00.000Z");
    await db()
        .collection("card")
        .doc(id)
        .set({
            boardId,
            slug,
            title: slug,
            spec: {
                path: `specs/features/${slug}.md`,
                sha: "x",
                status: "approved",
            },
            ready: true,
            orphan: false,
            lane: "tasks",
            stageKey: null,
            state: "idle",
            reworkLoops: 0,
            order: 0,
            branch: `feat/${slug}`,
            movedAt: null,
            movedByUserId: null,
            syncedAt: at,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
        });
    return id;
}

const scriptCard = (cardId: string, outcomes: string[]) =>
    db()
        .collection("fakeExecutorScript")
        .doc(cardId)
        .set({ outcomes, claims: {} });

const runsOf = async (cardId: string) =>
    (await db().collection("run").where("cardId", "==", cardId).get()).docs.map(
        (docSnap) => docSnap.data()
    );

/** Reads the board the way the screen polls it, the clock moving one fake run at a time. */
async function driveUntilSettled(board: BoardDTO, cardId: string, start: Date) {
    const MAX_READS = 30;
    const initial = await cardRepository.findById(cardId);
    const stages: string[] = initial?.stageKey ? [initial.stageKey] : [];
    let now = start;
    for (let read = 0; read < MAX_READS; read += 1) {
        now = new Date(now.getTime() + FAKE_RUN_DURATION_MS);
        await tick(board, now);
        const card = await cardRepository.findById(cardId);
        if (card?.activeRunId === null) {
            return { card, stages };
        }
        if (card?.stageKey && stages.at(-1) !== card.stageKey) {
            stages.push(card.stageKey);
        }
    }
    throw new Error(`${cardId} did not settle after ${MAX_READS} reads`);
}

afterAll(async () => {
    for (const boardId of usedBoards) {
        for (const collection of ["card", "run", "cardEvent", "cycle"]) {
            const snapshot = await db()
                .collection(collection)
                .where("boardId", "==", boardId)
                .get();
            await Promise.all(
                snapshot.docs.map((docSnap) => docSnap.ref.delete())
            );
        }
        const scripts = await db()
            .collection("fakeExecutorScript")
            .where("__name__", ">=", boardId)
            .where("__name__", "<", `${boardId}~`)
            .get();
        await Promise.all(scripts.docs.map((docSnap) => docSnap.ref.delete()));
        await db().collection("board").doc(boardId).delete();
    }
});

describe("orchestrator against the Firestore emulator", () => {
    it("lets only one of two simultaneous triggers on a card through", async () => {
        const board = await createBoard();
        const cardId = await createCard(board.id, "twin-drag");
        const now = new Date("2026-11-26T10:00:00.000Z");

        const results = await Promise.all([
            triggerStage({
                board,
                slug: "twin-drag",
                stageKey: "analyze",
                by: OCTO,
                now,
            }),
            triggerStage({
                board,
                slug: "twin-drag",
                stageKey: "develop",
                by: OCTO,
                now,
            }),
        ]);

        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.find((result) => !result.ok)).toMatchObject({
            ok: false,
            code: "CARD_RUN_ACTIVE",
        });
        expect(await runsOf(cardId)).toHaveLength(1);
    });

    it("applies a repeated stage result once, creating one next run", async () => {
        const board = await createBoard();
        const cardId = await createCard(board.id, "repeated-result");
        const now = new Date("2026-11-26T10:00:00.000Z");
        const triggered = await triggerStage({
            board,
            slug: "repeated-result",
            stageKey: "analyze",
            by: OCTO,
            now,
        });
        if (!triggered.ok) {
            throw new Error(triggered.code);
        }

        const results = await Promise.all(
            ["first", "repeated", "late"].map(() =>
                completeRun({
                    board,
                    runId: triggered.run.id,
                    outcome: "success",
                    endReason: "agent",
                    now,
                })
            )
        );

        expect(results.filter((result) => !result.ignored)).toHaveLength(1);
        const runs = await runsOf(cardId);
        expect(runs).toHaveLength(2);
        expect(runs.filter((run) => run.stageKey === "develop")).toHaveLength(
            1
        );
        expect(await cardRepository.findById(cardId)).toMatchObject({
            stageKey: "develop",
            state: "running",
            lastRun: { stageKey: "analyze", outcome: "success" },
        });
    });

    it("keeps the second card queued when the column's limit is one", async () => {
        const board = await createBoard({
            analyze: { wipLimit: 1, approvalGate: false },
        });
        const first = await createCard(board.id, "wip-first");
        const second = await createCard(board.id, "wip-second");
        const now = new Date("2026-11-26T10:00:00.000Z");

        await Promise.all([
            triggerStage({
                board,
                slug: "wip-first",
                stageKey: "analyze",
                by: OCTO,
                now,
            }),
            triggerStage({
                board,
                slug: "wip-second",
                stageKey: "analyze",
                by: OCTO,
                now,
            }),
        ]);

        const states = await Promise.all(
            [first, second].map(
                async (id) => (await cardRepository.findById(id))?.state
            )
        );
        expect(states.sort()).toEqual(["queued", "running"]);
        const live = await runRepository.listActiveByBoard(board.id);
        expect(live.map((run) => run.status).sort()).toEqual([
            "queued",
            "running",
        ]);

        const running = live.find((run) => run.status === "running");
        await stopRun({
            board,
            slug: running?.slug ?? "",
            by: OCTO,
            now,
        });
        const afterStop = await runRepository.listActiveByBoard(board.id);
        expect(afterStop.map((run) => run.status)).toEqual(["running"]);
    });

    it("walks the card through every stage, opens its pull request and takes it to Done on merge", async () => {
        const board = await createBoard();
        const cardId = await createCard(board.id, "happy-path");
        const start = new Date("2026-11-26T10:00:00.000Z");
        await triggerStage({
            board,
            slug: "happy-path",
            stageKey: "analyze",
            by: OCTO,
            now: start,
        });

        const { card, stages } = await driveUntilSettled(board, cardId, start);

        expect(stages).toEqual(["analyze", "develop", "review", "test", "pr"]);
        expect(card).toMatchObject({
            lane: "stage",
            stageKey: "pr",
            state: "idle",
            lastRun: { stageKey: "pr", outcome: "success" },
            pullRequestError: null,
            pullRequest: {
                state: "open",
                draft: true,
                headRef: "feat/happy-path",
                baseRef: "main",
                openedByBoard: true,
                dispatchAs: OCTO,
            },
        });
        const number = card?.pullRequest?.number as number;

        // What the merge webhook writes, against the real transaction and mapper.
        await cardRepository.updatePullRequest(cardId, (stored) =>
            stored.pullRequest?.number === number
                ? {
                      pullRequest: applyPullRequestEvent(stored.pullRequest, {
                          kind: "closed",
                          merged: true,
                          byLogin: "qa-pr-flow",
                          at: new Date().toISOString(),
                      }),
                  }
                : null
        );
        await settlePullRequest(board, cardId);

        expect(await cardRepository.findById(cardId)).toMatchObject({
            lane: "done",
            stageKey: null,
            state: "idle",
            movedByUserId: null,
            pullRequest: { state: "merged", closedByLogin: "qa-pr-flow" },
        });
        const reports = await db()
            .collection("cardEvent")
            .where("cardId", "==", cardId)
            .where("type", "==", "report")
            .get();
        expect(reports.size).toBe(config.stages.length);
        expect(reports.docs.every((docSnap) => docSnap.data().runId)).toBe(
            true
        );
    });

    it("loops back on rework twice and stops waiting for a person on the third", async () => {
        const board = await createBoard();
        const cardId = await createCard(board.id, "rework-path");
        await scriptCard(cardId, [
            "success",
            "success",
            "needs_rework",
            "success",
            "needs_rework",
            "success",
            "needs_rework",
        ]);
        const start = new Date("2026-11-26T10:00:00.000Z");
        await triggerStage({
            board,
            slug: "rework-path",
            stageKey: "analyze",
            by: OCTO,
            now: start,
        });

        const { card, stages } = await driveUntilSettled(board, cardId, start);

        expect(await runsOf(cardId)).toHaveLength(stages.length);
        expect(stages).toEqual([
            "analyze",
            "develop",
            "review",
            "develop",
            "review",
            "develop",
            "review",
        ]);
        expect(card).toMatchObject({
            lane: "stage",
            stageKey: "review",
            state: "waiting_input",
            reworkLoops: 2,
            activeRunId: null,
        });
    });

    it("fails a silent run on its deadline", async () => {
        const board = await createBoard();
        const cardId = await createCard(board.id, "silent-run");
        await scriptCard(cardId, ["silent"]);
        const start = new Date("2026-11-26T10:00:00.000Z");
        await triggerStage({
            board,
            slug: "silent-run",
            stageKey: "analyze",
            by: OCTO,
            now: start,
        });

        await tick(board, new Date(start.getTime() + FAKE_RUN_DURATION_MS));
        expect(await cardRepository.findById(cardId)).toMatchObject({
            state: "running",
        });

        const MS_PER_MINUTE = 60_000;
        await tick(
            board,
            new Date(
                start.getTime() +
                    config.limits.stageTimeoutMinutes * MS_PER_MINUTE
            )
        );
        expect(await cardRepository.findById(cardId)).toMatchObject({
            stageKey: "analyze",
            state: "failed",
            activeRunId: null,
            lastRun: { outcome: "failed", endReason: "timeout" },
        });
    });

    it("runs a cycle one spec at a time past the approval gate and closes it", async () => {
        const board = await createBoard({
            analyze: { wipLimit: null, approvalGate: true },
        });
        const first = await createCard(board.id, "cycle-first");
        const second = await createCard(board.id, "cycle-second");
        const start = new Date("2026-11-26T10:00:00.000Z");
        const created = await createCycle({
            board,
            input: {
                slugs: ["cycle-first", "cycle-second"],
                options: {
                    until: "pull_request",
                    concurrency: 1,
                    onFailure: "skip",
                },
            },
            by: OCTO,
            now: start,
        });
        if (!created.ok) {
            throw new Error(created.code);
        }
        const cycleId = created.cycle.id;

        const MAX_READS = 40;
        let now = start;
        for (let read = 0; read < MAX_READS; read += 1) {
            const cycle = await cycleRepository.findById(cycleId);
            if (cycle?.status !== "running") {
                break;
            }
            now = new Date(now.getTime() + FAKE_RUN_DURATION_MS);
            await tick(board, now);
        }

        const cycle = await cycleRepository.findById(cycleId);
        expect(cycle).toMatchObject({
            status: "finished",
            endReason: "completed",
            items: [
                { slug: "cycle-first", status: "done" },
                { slug: "cycle-second", status: "done" },
            ],
        });
        for (const cardId of [first, second]) {
            expect(await cardRepository.findById(cardId)).toMatchObject({
                lane: "stage",
                stageKey: "pr",
                state: "idle",
                cycleId: null,
                pullRequest: { state: "open" },
            });
        }
        const firstRuns = await runsOf(first);
        const secondRuns = await runsOf(second);
        expect(firstRuns.every((run) => run.cycleId === cycleId)).toBe(true);
        const lastOfFirst = Math.max(
            ...firstRuns.map((run) => run.finishedAt.toMillis())
        );
        const firstOfSecond = Math.min(
            ...secondRuns.map((run) => run.queuedAt.toMillis())
        );
        expect(firstOfSecond).toBeGreaterThanOrEqual(lastOfFirst);
        const boardDoc = await db().collection("board").doc(board.id).get();
        expect(boardDoc.data()?.runningCycleId).toBeNull();
        const reports = await db()
            .collection("cardEvent")
            .where("cycleId", "==", cycleId)
            .where("type", "==", "report")
            .get();
        expect(reports.size).toBe(2 * config.stages.length);
        expect(
            reports.docs.some((docSnap) =>
                (docSnap.data().decisions ?? []).some(
                    (decision: { product: boolean }) => decision.product
                )
            )
        ).toBe(true);
    });

    it("lets only one of two cycles created at once run, and starts the other after it", async () => {
        const board = await createBoard();
        await createCard(board.id, "queue-a");
        await createCard(board.id, "queue-b");
        const start = new Date("2026-11-26T10:00:00.000Z");
        const options = {
            until: "testing" as const,
            concurrency: 1 as const,
            onFailure: "skip" as const,
        };
        const results = await Promise.all(
            ["queue-a", "queue-b"].map((slug) =>
                createCycle({
                    board,
                    input: { slugs: [slug], options },
                    by: OCTO,
                    now: start,
                })
            )
        );
        const cycles = results.map((result) => {
            if (!result.ok) {
                throw new Error(result.code);
            }
            return result.cycle;
        });
        expect(cycles.map((cycle) => cycle.status).sort()).toEqual([
            "queued",
            "running",
        ]);
        const queued = cycles.find((cycle) => cycle.status === "queued");
        const boardDoc = await db().collection("board").doc(board.id).get();
        expect(boardDoc.data()?.runningCycleId).toBe(
            cycles.find((cycle) => cycle.status === "running")?.id
        );

        const MAX_READS = 40;
        let now = start;
        for (let read = 0; read < MAX_READS; read += 1) {
            const stored = await cycleRepository.findById(queued?.id ?? "");
            if (stored?.status === "finished") {
                break;
            }
            now = new Date(now.getTime() + FAKE_RUN_DURATION_MS);
            await tick(board, now);
        }
        const stored = await Promise.all(
            cycles.map((cycle) => cycleRepository.findById(cycle.id))
        );
        expect(stored.map((cycle) => cycle?.status)).toEqual([
            "finished",
            "finished",
        ]);
        for (const slug of ["queue-a", "queue-b"]) {
            expect(
                await cardRepository.findById(`${board.id}__${slug}`)
            ).toMatchObject({ stageKey: "test", state: "idle", cycleId: null });
        }
    });
});
