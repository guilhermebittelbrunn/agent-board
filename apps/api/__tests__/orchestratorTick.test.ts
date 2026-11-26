import { parseBoardConfig } from "@repo/kanban-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";
import {
    isoBefore,
    NOW,
    runFixture,
    TEN_MINUTES_MS,
    TWO_MINUTES_MS,
} from "./runnerFixtures";

const { store, fake, local, executorsMock } = vi.hoisted(() => ({
    store: {
        runs: [] as RunRecord[],
        closed: [] as { id: string; endReason: string }[],
    },
    fake: {
        kind: "fake",
        dispatch: vi.fn(),
        cancel: vi.fn(),
        collect: vi.fn(),
    },
    local: { kind: "local", dispatch: vi.fn(), cancel: vi.fn() },
    executorsMock: vi.fn(),
}));

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {
        listActiveByBoard: () =>
            Promise.resolve(store.runs.filter((run) => run.active)),
        finishOnCard: (input: {
            runId: string;
            close: { endReason: string };
        }) => {
            const run = store.runs.find(
                (candidate) => candidate.id === input.runId
            );
            if (!run?.active) {
                return Promise.resolve({ ignored: true });
            }
            run.active = false;
            store.closed.push({ id: run.id, endReason: input.close.endReason });
            return Promise.resolve({ ignored: false, nextRunId: null });
        },
        promote: (input: {
            executorFor: (run: RunRecord) => RunRecord["executor"];
        }) => {
            const started = store.runs
                .filter((run) => run.active && run.status === "queued")
                .map((run) => {
                    run.status = "running";
                    run.executor = input.executorFor(run);
                    run.startedAt = NOW.toISOString();
                    return { ...run };
                });
            return Promise.resolve(started);
        },
    },
}));

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: { findById: () => Promise.resolve(null) },
}));

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: { appendAgentEvent: vi.fn() },
}));

vi.mock("@/(shared)/lib/orchestrator/executor", () => ({
    getStageExecutor: (kind: string) =>
        ({ fake, local })[kind as "fake" | "local"] ?? null,
}));

vi.mock("@/(shared)/lib/orchestrator/executor-choice", () => ({
    executorsForUsers: (...args: unknown[]) => executorsMock(...args),
    resolveExecutorFor: vi.fn(),
}));

const { tick } = await import("@/(shared)/lib/orchestrator/orchestrator");

const config = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;
if (config === undefined) {
    throw new Error("sample board.yml must parse");
}
const board = {
    id: "agent-board-demo--sample-app",
    config,
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
    stageSettings: {},
} as unknown as Parameters<typeof tick>[0];

beforeEach(() => {
    store.runs = [];
    store.closed = [];
    for (const mock of [
        fake.dispatch,
        fake.collect,
        local.dispatch,
        executorsMock,
    ]) {
        mock.mockReset();
    }
    fake.collect.mockResolvedValue([]);
    local.dispatch.mockResolvedValue({ ok: true, sessionUrl: null });
    fake.dispatch.mockResolvedValue({ ok: true, sessionUrl: null });
});

describe("tick with local and fake runs", () => {
    it("never hands a local run to the fake executor's collect", async () => {
        store.runs = [
            runFixture({ id: "local", executor: "local" }),
            runFixture({ id: "fake", executor: "fake" }),
        ];

        await tick(board, NOW);

        expect(fake.collect).toHaveBeenCalledTimes(1);
        const [views] = fake.collect.mock.calls[0] as [{ runId: string }[]];
        expect(views.map((view) => view.runId)).toEqual(["fake"]);
        expect(store.closed).toEqual([]);
    });

    it("ends with no_runner a local run nobody claimed in two minutes", async () => {
        store.runs = [
            runFixture({ id: "late", startedAt: isoBefore(TWO_MINUTES_MS) }),
            runFixture({
                id: "claimed",
                startedAt: isoBefore(TEN_MINUTES_MS),
                runnerId: "runnerA",
            }),
        ];

        await tick(board, NOW);

        expect(store.closed).toEqual([{ id: "late", endReason: "no_runner" }]);
    });
});

describe("promotion picks the executor of whoever triggered", () => {
    it("ends with no_runner a queued run whose person has no executor", async () => {
        store.runs = [
            runFixture({
                id: "q",
                status: "queued",
                executor: null,
                startedAt: null,
            }),
        ];
        executorsMock.mockResolvedValue(new Map([["u1", null]]));

        await tick(board, NOW);

        expect(executorsMock).toHaveBeenCalledWith(["u1"], NOW);
        expect(store.closed).toEqual([{ id: "q", endReason: "no_runner" }]);
        expect(local.dispatch).not.toHaveBeenCalled();
    });

    it("dispatches to the local executor for a person with a runner online", async () => {
        store.runs = [
            runFixture({
                id: "q",
                status: "queued",
                executor: null,
                startedAt: null,
            }),
            runFixture({
                id: "q2",
                status: "queued",
                executor: null,
                startedAt: null,
                triggeredBy: { userId: "u2", login: "other" },
            }),
        ];
        executorsMock.mockResolvedValue(
            new Map([
                ["u1", "local"],
                ["u2", "fake"],
            ])
        );

        await tick(board, NOW);

        expect(store.runs.map((run) => run.executor)).toEqual([
            "local",
            "fake",
        ]);
        expect(local.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ runId: "q" })
        );
        expect(fake.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ runId: "q2" })
        );
        expect(store.closed).toEqual([]);
    });
});
