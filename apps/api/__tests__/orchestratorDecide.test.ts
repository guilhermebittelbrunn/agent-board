import { parseBoardConfig } from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import {
    deadlineFor,
    decideTrigger,
    findExpired,
    pickPromotions,
    planCompletion,
    planTrigger,
    toStageDispatch,
} from "@/(shared)/lib/orchestrator/decide";
import type { CardRecord } from "@/(shared)/mappers/card.mapper";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";

const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
if (!parsed.success) {
    throw new Error("sample config is invalid");
}
const config = parsed.data;
const NOW = new Date("2026-11-26T10:00:00.000Z");
const OCTO = { userId: "p-owner", login: "octo" };

const card = (overrides: Partial<CardRecord> = {}): CardRecord => ({
    id: "b1__search-cards",
    boardId: "b1",
    slug: "search-cards",
    title: "Busca",
    spec: {
        path: "specs/features/search-cards.md",
        sha: "x",
        status: "approved",
    },
    ready: true,
    orphan: false,
    lane: "tasks",
    stageKey: null,
    state: "idle",
    pendingAsk: null,
    reworkLoops: 0,
    order: 0,
    branch: "feat/search-cards",
    activeRunId: null,
    lastRun: null,
    movedAt: null,
    movedByUserId: null,
    syncedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    deletedAt: null,
    ...overrides,
});

const run = (overrides: Partial<RunRecord> = {}): RunRecord => ({
    id: "r1",
    boardId: "b1",
    cardId: "b1__search-cards",
    slug: "search-cards",
    stageKey: "analyze",
    command: "/analyze",
    agent: "planejador-tarefa",
    model: "opus",
    effort: "high",
    maxTurns: 200,
    branch: "feat/search-cards",
    trigger: "drag",
    triggeredBy: OCTO,
    executor: null,
    status: "queued",
    active: true,
    outcome: null,
    endReason: null,
    stoppedBy: null,
    queuedAt: "2026-11-26T09:00:00.000Z",
    startedAt: null,
    deadlineAt: null,
    finishedAt: null,
    sessionUrl: null,
    turns: null,
    runnerId: null,
    claimedAt: null,
    runnerFinishedAt: null,
    createdAt: "2026-11-26T09:00:00.000Z",
    updatedAt: "2026-11-26T09:00:00.000Z",
    deletedAt: null,
    ...overrides,
});

describe("decideTrigger", () => {
    it("drags a ready card from Tasks into a stage, starting a new journey", () => {
        expect(
            decideTrigger(card({ reworkLoops: 2 }), "analyze", config)
        ).toMatchObject({
            ok: true,
            trigger: "drag",
            branch: "feat/search-cards",
            resetReworkLoops: true,
        });
    });

    it("refuses a stage outside board.yml and a card that is not ready", () => {
        expect(decideTrigger(card(), "deploy", config)).toEqual({
            ok: false,
            code: "CARD_STAGE_NOT_FOUND",
            status: 422,
        });
        expect(
            decideTrigger(card({ ready: false }), "analyze", config)
        ).toEqual({
            ok: false,
            code: "CARD_NOT_READY",
            status: 409,
        });
    });

    it("derives the branch from board.yml and refuses a protected one", () => {
        expect(
            decideTrigger(card({ branch: null }), "analyze", config)
        ).toMatchObject({ ok: true, branch: "feat/search-cards" });
        const protectedPattern = {
            ...config,
            branchPattern: "{slug}",
            protectedBranches: ["main", "search-cards"],
        };
        expect(
            decideTrigger(card({ branch: null }), "analyze", protectedPattern)
        ).toEqual({ ok: false, code: "CARD_BRANCH_INVALID", status: 422 });
    });

    it("runs the same stage again without resetting the rework loops", () => {
        const failed = card({
            lane: "stage",
            stageKey: "develop",
            state: "failed",
            reworkLoops: 1,
        });
        expect(decideTrigger(failed, "develop", config)).toMatchObject({
            ok: true,
            trigger: "rerun",
            resetReworkLoops: false,
        });
        expect(decideTrigger(failed, "review", config)).toMatchObject({
            trigger: "drag",
            resetReworkLoops: false,
        });
    });

    it("approves a card waiting in the stage after a successful one", () => {
        const waiting = card({
            lane: "stage",
            stageKey: "develop",
            lastRun: {
                id: "r0",
                stageKey: "analyze",
                status: "finished",
                outcome: "success",
                endReason: "agent",
                stoppedByLogin: null,
                finishedAt: NOW.toISOString(),
            },
        });
        expect(decideTrigger(waiting, "develop", config)).toMatchObject({
            ok: true,
            trigger: "approve",
        });
    });
});

describe("planTrigger", () => {
    const input = { stageKey: "analyze", config, by: OCTO, now: NOW };

    it("refuses a missing card and one with a live run", () => {
        expect(planTrigger(null, input)).toEqual({
            ok: false,
            code: "CARD_NOT_FOUND",
            status: 404,
        });
        expect(planTrigger(card({ activeRunId: "r1" }), input)).toEqual({
            ok: false,
            code: "CARD_RUN_ACTIVE",
            status: 409,
        });
    });

    it("copies the stage into the run and queues the card in the column", () => {
        const plan = planTrigger(card({ reworkLoops: 2 }), input);

        expect(plan).toMatchObject({
            ok: true,
            run: {
                stageKey: "analyze",
                command: "/analyze",
                agent: "planejador-tarefa",
                model: "opus",
                effort: "high",
                maxTurns: 200,
                branch: "feat/search-cards",
                trigger: "drag",
                triggeredBy: OCTO,
            },
            card: {
                lane: "stage",
                stageKey: "analyze",
                state: "queued",
                reworkLoops: 0,
                movedByUserId: OCTO.userId,
            },
        });
    });

    it("closes the questions of an earlier run when a new run starts", () => {
        const waiting = card({
            lane: "stage",
            stageKey: "analyze",
            state: "waiting_input",
            pendingAsk: { eventId: "e-ask", stageKey: "analyze", count: 2 },
        });

        const plan = planTrigger(waiting, { ...input, stageKey: "develop" });

        expect(plan.ok).toBe(true);
        if (plan.ok) {
            expect(plan.card.pendingAsk).toBeNull();
            expect(plan.card.state).toBe("queued");
        }
    });

    it("keeps the kind the caller forces, as an answer does", () => {
        const waiting = card({
            lane: "stage",
            stageKey: "analyze",
            state: "waiting_input",
        });
        expect(
            planTrigger(waiting, { ...input, trigger: "answer" })
        ).toMatchObject({ ok: true, run: { trigger: "answer" } });
    });
});

describe("planCompletion", () => {
    const complete = (
        outcome: Parameters<typeof planCompletion>[0]["outcome"],
        stageKey: string,
        overrides: { reworkLoops?: number; approvalGate?: boolean } = {}
    ) =>
        planCompletion({
            card: {
                state: "running",
                reworkLoops: overrides.reworkLoops ?? 0,
            },
            run: { stageKey },
            outcome,
            config,
            stageSettings: overrides.approvalGate
                ? { [stageKey]: { wipLimit: null, approvalGate: true } }
                : {},
        });

    it("queues the next stage on success", () => {
        const plan = complete("success", "analyze");

        expect(plan.card).toEqual({
            lane: "stage",
            stageKey: "develop",
            state: "queued",
            reworkLoops: 0,
        });
        expect(plan.next).toMatchObject({
            stage: { key: "develop" },
            trigger: "transition",
        });
    });

    it("stops in the next stage when the board asks for approval", () => {
        expect(complete("success", "analyze", { approvalGate: true })).toEqual({
            card: {
                lane: "stage",
                stageKey: "develop",
                state: "idle",
                reworkLoops: 0,
            },
            next: null,
        });
    });

    it("takes the card to Done after the last stage", () => {
        expect(complete("success", "test")).toEqual({
            card: {
                lane: "done",
                stageKey: null,
                state: "idle",
                reworkLoops: 0,
            },
            next: null,
        });
    });

    it("sends the card back on rework and counts the loop", () => {
        const plan = complete("needs_rework", "review", { reworkLoops: 1 });

        expect(plan.card).toEqual({
            lane: "stage",
            stageKey: "develop",
            state: "queued",
            reworkLoops: 2,
        });
        expect(plan.next?.stage.key).toBe("develop");
    });

    it("stops waiting for a person once the rework loops run out", () => {
        expect(complete("needs_rework", "review", { reworkLoops: 2 })).toEqual({
            card: {
                lane: "stage",
                stageKey: "review",
                state: "waiting_input",
                reworkLoops: 2,
            },
            next: null,
        });
    });

    it("waits for answers on needs_input and stays failed on failure", () => {
        expect(complete("needs_input", "analyze")).toEqual({
            card: {
                lane: "stage",
                stageKey: "analyze",
                state: "waiting_input",
                reworkLoops: 0,
            },
            next: null,
        });
        expect(complete("failed", "develop").card).toMatchObject({
            stageKey: "develop",
            state: "failed",
        });
    });

    it("fails a run whose stage left board.yml instead of throwing", () => {
        expect(complete("success", "deploy")).toEqual({
            card: {
                lane: "stage",
                stageKey: "deploy",
                state: "failed",
                reworkLoops: 0,
            },
            next: null,
        });
    });
});

describe("pickPromotions", () => {
    const runs = [
        run({
            id: "a",
            stageKey: "analyze",
            queuedAt: "2026-11-26T09:02:00.000Z",
        }),
        run({
            id: "b",
            stageKey: "analyze",
            queuedAt: "2026-11-26T09:01:00.000Z",
        }),
        run({
            id: "c",
            stageKey: "develop",
            queuedAt: "2026-11-26T09:03:00.000Z",
        }),
    ];

    it("starts every queued run without a limit, oldest first", () => {
        expect(pickPromotions(runs, {}).map((picked) => picked.id)).toEqual([
            "b",
            "a",
            "c",
        ]);
    });

    it("leaves the excess queued when the column is at its limit", () => {
        const settings = { analyze: { wipLimit: 1, approvalGate: false } };
        expect(
            pickPromotions(runs, settings).map((picked) => picked.id)
        ).toEqual(["b", "c"]);
        expect(
            pickPromotions(
                [...runs, run({ id: "x", status: "running" })],
                settings
            ).map((picked) => picked.id)
        ).toEqual(["c"]);
    });
});

describe("findExpired and deadlineFor", () => {
    it("expires only running runs past their deadline", () => {
        const deadline = deadlineFor(NOW, config);
        expect(deadline.toISOString()).toBe("2026-11-26T10:45:00.000Z");

        const running = run({
            id: "late",
            status: "running",
            deadlineAt: deadline.toISOString(),
        });
        expect(
            findExpired([running, run()], new Date(deadline.getTime() - 1))
        ).toEqual([]);
        expect(
            findExpired([running, run()], deadline).map((expired) => expired.id)
        ).toEqual(["late"]);
    });
});

describe("toStageDispatch", () => {
    it("sends only the expected fields", () => {
        expect(
            Object.keys(
                toStageDispatch(run(), {
                    repository: {
                        installationId: 1,
                        owner: "agent-board-demo",
                        name: "sample-app",
                        fullName: "agent-board-demo/sample-app",
                        defaultBranch: "main",
                        private: false,
                    },
                })
            ).sort()
        ).toEqual(
            [
                "agent",
                "boardId",
                "branch",
                "cardId",
                "command",
                "effort",
                "maxTurns",
                "model",
                "repository",
                "runId",
                "slug",
                "stageKey",
                "triggeredBy",
            ].sort()
        );
    });
});
