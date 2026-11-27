import {
    type BoardRole,
    type CycleAdvance,
    type CycleState,
    canTriggerStages,
    canViewBoard,
    parseBoardConfig,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import type {
    CycleItemRecord,
    CycleRecord,
} from "@/(shared)/mappers/cycle.mapper";
import type { NewCycle } from "@/(shared)/repositories/cycle.repository";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const BOARD_ID = "b1";
const NOW_ISO = "2026-11-27T22:00:00.000Z";
const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;

const {
    access,
    cardStore,
    cycles,
    triggerMock,
    stopRunMock,
    executorChoiceMock,
    runnersMock,
} = vi.hoisted(() => ({
    access: { role: "operator" as string },
    cardStore: { current: null as unknown },
    cycles: new Map<string, Record<string, unknown>>(),
    triggerMock: vi.fn(),
    stopRunMock: vi.fn(),
    executorChoiceMock: vi.fn(),
    runnersMock: vi.fn(),
}));

const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
if (!parsed.success) {
    throw new Error("sample config is invalid");
}
const board = {
    id: BOARD_ID,
    config: parsed.data,
    repository: { owner: "agent-board-demo", name: "sample-app" },
    stageSettings: {},
};

vi.mock("@/app/(guards)/board", () => ({
    requireBoardApi:
        (
            capability: "view" | "trigger",
            handler: (req: NextRequest, ctx: unknown) => Promise<Response>
        ) =>
        async (req: NextRequest, ctx: { params: Promise<unknown> }) => {
            const role = access.role as BoardRole;
            const allowed =
                capability === "view"
                    ? canViewBoard(role)
                    : canTriggerStages(role);
            if (!allowed) {
                return Response.json(
                    { error: { code: "BOARD_FORBIDDEN" } },
                    { status: 403 }
                );
            }
            return handler(req, {
                params: await ctx.params,
                board,
                profile: { id: "u1" },
                member: { login: "octo" },
            });
        },
}));

vi.mock("@/(shared)/lib/orchestrator/tick-safely", () => ({
    tickSafely: () => Promise.resolve(),
}));

vi.mock("@/(shared)/lib/orchestrator/orchestrator", () => ({
    triggerStage: (...args: unknown[]) => triggerMock(...args),
    stopRun: (...args: unknown[]) => stopRunMock(...args),
}));

vi.mock("@/(shared)/lib/orchestrator/executor-choice", () => ({
    chooseExecutorFor: (...args: unknown[]) => executorChoiceMock(...args),
}));

vi.mock("@/(shared)/repositories/runner.repository", () => ({
    runnerRepository: {
        listByUser: (...args: unknown[]) => runnersMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: new Proxy(
        {},
        {
            get: (_target, property: string) =>
                (
                    (cardStore.current as FakeCardRepository)
                        .repository as unknown as Record<string, unknown>
                )[property],
        }
    ),
}));

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: {
        listByCycle: () =>
            Promise.resolve([
                {
                    id: "e1",
                    boardId: BOARD_ID,
                    cardId: `${BOARD_ID}__alpha`,
                    stageKey: "analyze",
                    lane: "stage",
                    author: { kind: "agent", name: "planejador-tarefa" },
                    runId: "r1",
                    createdAt: NOW_ISO,
                    updatedAt: NOW_ISO,
                    type: "report",
                    markdown: "### Análise",
                    outcome: "success",
                    decisions: [
                        {
                            decision: "Busca só pelo título.",
                            rule: "spec",
                            product: true,
                        },
                    ],
                },
            ]),
    },
}));

/** In-memory cycles read through the real mapper, with the board lock of the real repository. */
vi.mock("@/(shared)/repositories/cycle.repository", async () => {
    const { cycleMapper } = await import("@/(shared)/mappers/cycle.mapper");
    const lock = { runningCycleId: null as string | null };
    const read = (id: string): CycleRecord | null => {
        const document = cycles.get(id);
        return document ? cycleMapper.toDTO({ id, ...document }) : null;
    };
    return {
        cycleRepository: {
            lock,
            findById: (id: string) => Promise.resolve(read(id)),
            findInBoard: (boardId: string, id: string) => {
                const cycle = read(id);
                return Promise.resolve(
                    cycle?.boardId === boardId ? cycle : null
                );
            },
            listByBoard: (boardId: string) =>
                Promise.resolve(
                    [...cycles.keys()]
                        .map(read)
                        .filter((cycle) => cycle?.boardId === boardId)
                ),
            createOnBoard: ({ cycle }: { cycle: NewCycle; now: Date }) => {
                const busy = [...cycles.keys()]
                    .map(read)
                    .filter(
                        (stored) =>
                            stored?.status === "queued" ||
                            stored?.status === "running"
                    )
                    .flatMap((stored) =>
                        (stored?.items ?? []).map((item) => item.slug)
                    );
                if (cycle.items.some((item) => busy.includes(item.slug))) {
                    return Promise.resolve({
                        ok: false,
                        code: "CYCLE_SPEC_BUSY",
                        status: 409,
                    });
                }
                const id = `c${cycles.size + 1}`;
                const running = lock.runningCycleId === null;
                cycles.set(id, {
                    ...cycle,
                    status: running ? "running" : "queued",
                    endReason: null,
                    stoppedBy: null,
                    startedAt: running ? NOW_ISO : null,
                    finishedAt: null,
                    createdAt: NOW_ISO,
                    updatedAt: NOW_ISO,
                    deletedAt: null,
                });
                if (running) {
                    lock.runningCycleId = id;
                }
                return Promise.resolve({ ok: true, cycle: read(id) });
            },
            applyAdvance: (
                id: string,
                decide: (
                    cycle: CycleState<CycleItemRecord>
                ) => CycleAdvance<CycleItemRecord>
            ) => {
                const stored = read(id);
                if (stored === null) {
                    return Promise.resolve(null);
                }
                const decided = decide(stored);
                cycles.set(id, { ...cycles.get(id), ...decided.cycle });
                if (decided.ended && lock.runningCycleId === id) {
                    lock.runningCycleId = null;
                }
                return Promise.resolve({ ...decided, cycle: read(id) });
            },
            startNextQueued: () => Promise.resolve(null),
            stop: ({ cycleId }: { cycleId: string }) => {
                const stored = read(cycleId);
                if (stored === null) {
                    return Promise.resolve({
                        ok: false,
                        code: "CYCLE_NOT_FOUND",
                        status: 404,
                    });
                }
                if (stored.status !== "queued" && stored.status !== "running") {
                    return Promise.resolve({
                        ok: false,
                        code: "CYCLE_NOT_ACTIVE",
                        status: 409,
                    });
                }
                cycles.set(cycleId, {
                    ...cycles.get(cycleId),
                    status: "stopped",
                    endReason: "stopped",
                });
                if (lock.runningCycleId === cycleId) {
                    lock.runningCycleId = null;
                }
                return Promise.resolve({
                    ok: true,
                    wasRunning: stored.status === "running",
                    cycle: read(cycleId),
                });
            },
        },
    };
});

const { GET, POST } = await import("@/app/(routes)/boards/[id]/cycles/route");
const { GET: GET_ONE } = await import(
    "@/app/(routes)/boards/[id]/cycles/[cycleId]/route"
);
const { POST: STOP } = await import(
    "@/app/(routes)/boards/[id]/cycles/[cycleId]/stop/route"
);
const { cycleRepository } = await import(
    "@/(shared)/repositories/cycle.repository"
);

let cards: FakeCardRepository;

const request = (body?: unknown) =>
    new Request("http://localhost/api", {
        method: body === undefined ? "GET" : "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { "content-type": "application/json" },
    }) as unknown as NextRequest;

const boardParams = { params: Promise.resolve({ id: BOARD_ID }) };
const cycleParams = (cycleId: string) => ({
    params: Promise.resolve({ id: BOARD_ID, cycleId }),
});

const options = { until: "pull_request", concurrency: 1, onFailure: "skip" };

async function errorOf(response: Response) {
    const body = (await response.json()) as { error: { code: string } };
    return { status: response.status, code: body.error.code };
}

const create = (slugs: string[], overrides: Record<string, unknown> = {}) =>
    POST(
        request({ slugs, options: { ...options, ...overrides } }),
        boardParams
    );

beforeEach(() => {
    access.role = "operator";
    cycles.clear();
    Object.assign((cycleRepository as unknown as { lock: object }).lock, {
        runningCycleId: null,
    });
    cards = createFakeCardRepository();
    cardStore.current = cards;
    for (const slug of ["alpha", "beta", "gamma"]) {
        cards.seed(BOARD_ID, slug);
    }
    triggerMock.mockReset();
    triggerMock.mockResolvedValue({ ok: true });
    stopRunMock.mockReset();
    stopRunMock.mockResolvedValue({ ok: true });
    executorChoiceMock.mockReset();
    executorChoiceMock.mockResolvedValue({ ok: true, executor: "local" });
    runnersMock.mockReset();
    runnersMock.mockResolvedValue([]);
});

describe("POST /boards/:id/cycles", () => {
    it("starts the cycle and triggers the first spec only", async () => {
        const response = await create(["alpha", "beta"]);
        const { data } = (await response.json()) as {
            data: { status: string; items: { status: string }[] };
        };

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(data.status).toBe("running");
        expect(data.items.map((item) => item.status)).toEqual([
            "running",
            "pending",
        ]);
        expect(triggerMock).toHaveBeenCalledTimes(1);
        expect(triggerMock).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: "alpha",
                stageKey: "analyze",
                trigger: "cycle",
                cycleId: expect.any(String),
                by: { userId: "u1", login: "octo" },
            })
        );
    });

    it("queues a second cycle while one runs", async () => {
        await create(["alpha"]);
        const response = await create(["beta"]);
        const { data } = (await response.json()) as {
            data: { status: string };
        };

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(data.status).toBe("queued");
        expect(triggerMock).toHaveBeenCalledTimes(1);
    });

    it("fails an item whose trigger is refused and moves on", async () => {
        triggerMock
            .mockResolvedValueOnce({
                ok: false,
                code: "CARD_NOT_READY",
                status: 409,
            })
            .mockResolvedValueOnce({ ok: true });
        const response = await create(["alpha", "beta"]);
        const { data } = (await response.json()) as {
            data: { items: { status: string; code: string | null }[] };
        };

        expect(data.items).toMatchObject([
            { status: "failed", code: "CARD_NOT_READY" },
            { status: "running", code: null },
        ]);
    });

    it("fails an item whose trigger throws instead of holding the cycle", async () => {
        triggerMock
            .mockRejectedValueOnce(new Error("firestore down"))
            .mockResolvedValueOnce({ ok: true });
        const response = await create(["alpha", "beta"]);
        const { data } = (await response.json()) as {
            data: { items: { status: string }[] };
        };

        expect(data.items.map((item) => item.status)).toEqual([
            "failed",
            "running",
        ]);
    });

    it("stops the cycle on a failed item when onFailure is stop", async () => {
        triggerMock.mockResolvedValueOnce({
            ok: false,
            code: "CARD_NOT_READY",
            status: 409,
        });
        const response = await create(["alpha", "beta"], {
            onFailure: "stop",
        });
        const { data } = (await response.json()) as {
            data: {
                status: string;
                endReason: string;
                items: { status: string }[];
            };
        };

        expect(data).toMatchObject({
            status: "stopped",
            endReason: "item_failed",
        });
        expect(data.items.map((item) => item.status)).toEqual([
            "failed",
            "skipped",
        ]);
        expect(triggerMock).toHaveBeenCalledTimes(1);
    });

    it("refuses an empty list or a duplicated slug", async () => {
        expect(await errorOf(await create([]))).toEqual({
            status: 400,
            code: "VALIDATION_FAILED",
        });
        expect(await errorOf(await create(["alpha", "alpha"]))).toEqual({
            status: 400,
            code: "VALIDATION_FAILED",
        });
    });

    it("refuses a card outside Tasks, not ready or already running", async () => {
        cards.seed(BOARD_ID, "draft-like", { ready: false });
        cards.seed(BOARD_ID, "busy", { activeRunId: "r1" });
        cards.seed(BOARD_ID, "moving", { lane: "stage", stageKey: "develop" });
        for (const slug of ["draft-like", "busy", "moving", "missing"]) {
            expect(await errorOf(await create(["alpha", slug]))).toEqual({
                status: HTTP_STATUS.UNPROCESSABLE_ENTITY,
                code: "CYCLE_SPECS_INVALID",
            });
        }
    });

    it("refuses a spec already in an active cycle", async () => {
        await create(["alpha"]);
        expect(await errorOf(await create(["alpha", "beta"]))).toEqual({
            status: HTTP_STATUS.CONFLICT,
            code: "CYCLE_SPEC_BUSY",
        });
    });

    it("answers with the executor refusals of a trigger", async () => {
        executorChoiceMock.mockResolvedValueOnce({
            ok: false,
            refusal: "stage_not_served",
        });
        expect(await errorOf(await create(["alpha"]))).toEqual({
            status: HTTP_STATUS.CONFLICT,
            code: "RUN_NO_CREDENTIAL_FOR_STAGE",
        });
        executorChoiceMock.mockResolvedValueOnce({
            ok: false,
            refusal: "no_executor",
        });
        expect(await errorOf(await create(["alpha"]))).toEqual({
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
            code: "RUN_EXECUTOR_UNAVAILABLE",
        });
    });

    it("asks for two online runners to run two specs at once", async () => {
        runnersMock.mockResolvedValue([
            { lastSeenAt: new Date().toISOString(), deletedAt: null },
        ]);
        expect(
            await errorOf(await create(["alpha", "beta"], { concurrency: 2 }))
        ).toEqual({
            status: HTTP_STATUS.CONFLICT,
            code: "CYCLE_RUNNERS_UNAVAILABLE",
        });
    });

    it("lets the test executor run two at once without runners", async () => {
        executorChoiceMock.mockResolvedValue({ ok: true, executor: "fake" });
        const response = await create(["alpha", "beta"], { concurrency: 2 });

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(triggerMock).toHaveBeenCalledTimes(2);
    });

    it("refuses a viewer before reading anything", async () => {
        access.role = "viewer";
        expect(await errorOf(await create(["alpha"]))).toEqual({
            status: HTTP_STATUS.FORBIDDEN,
            code: "BOARD_FORBIDDEN",
        });
        expect(triggerMock).not.toHaveBeenCalled();
    });
});

describe("GET /boards/:id/cycles and /cycles/:cycleId", () => {
    it("lists the board's cycles to a viewer", async () => {
        await create(["alpha"]);
        access.role = "viewer";
        const response = await GET(request(), boardParams);
        const { data } = (await response.json()) as {
            data: { startedByLogin: string }[];
        };

        expect(data).toHaveLength(1);
        expect(data[0]?.startedByLogin).toBe("octo");
        expect(data[0]).not.toHaveProperty("startedBy");
    });

    it("answers the detail with cards, decisions and activity", async () => {
        await create(["alpha", "beta"]);
        const response = await GET_ONE(request(), cycleParams("c1"));
        const { data } = (await response.json()) as {
            data: {
                cards: { slug: string }[];
                decisions: { slug: string; product: boolean }[];
                activity: unknown[];
            };
        };

        expect(data.cards.map((card) => card.slug)).toEqual(["alpha", "beta"]);
        expect(data.decisions).toEqual([
            expect.objectContaining({ slug: "alpha", product: true }),
        ]);
        expect(data.activity).toHaveLength(1);
    });

    it("closes an item whose card ended its run without advancing the cycle", async () => {
        await create(["alpha", "beta"]);
        cards.documents.set(`${BOARD_ID}__alpha`, {
            ...cards.documents.get(`${BOARD_ID}__alpha`),
            lane: "stage",
            stageKey: "pr",
            state: "idle",
            cycleId: null,
            activeRunId: null,
            lastRun: {
                id: "r9",
                stageKey: "pr",
                status: "finished",
                outcome: "success",
                endReason: "completed",
                finishedAt: new Date(Date.now() + ONE_MINUTE_MS),
            },
        });
        const response = await GET_ONE(request(), cycleParams("c1"));
        const { data } = (await response.json()) as {
            data: { cycle: { items: { status: string }[] } };
        };

        expect(data.cycle.items.map((item) => item.status)).toEqual([
            "done",
            "running",
        ]);
        expect(triggerMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ slug: "beta" })
        );
    });

    it("leaves alone an item whose first run has not ended yet", async () => {
        await create(["alpha", "beta"]);
        const response = await GET_ONE(request(), cycleParams("c1"));
        const { data } = (await response.json()) as {
            data: { cycle: { items: { status: string }[] } };
        };

        expect(data.cycle.items.map((item) => item.status)).toEqual([
            "running",
            "pending",
        ]);
        expect(triggerMock).toHaveBeenCalledTimes(1);
    });

    it("fails an item whose trigger never linked its card", async () => {
        await create(["alpha", "beta"]);
        const longAgo = new Date(Date.now() - ONE_HOUR_MS).toISOString();
        const stored = cycles.get("c1") as { items: { startedAt: unknown }[] };
        cycles.set("c1", {
            ...stored,
            items: stored.items.map((item, index) =>
                index === 0 ? { ...item, startedAt: longAgo } : item
            ),
        });
        const response = await GET_ONE(request(), cycleParams("c1"));
        const { data } = (await response.json()) as {
            data: { cycle: { items: { status: string }[] } };
        };

        expect(data.cycle.items.map((item) => item.status)).toEqual([
            "failed",
            "running",
        ]);
    });

    it("starts the pending items of a running cycle that never advanced", async () => {
        cycles.set("c1", {
            boardId: BOARD_ID,
            status: "running",
            endReason: null,
            options,
            items: ["alpha", "beta"].map((slug) => ({
                slug,
                cardId: `${BOARD_ID}__${slug}`,
                title: slug,
                status: "pending",
                code: null,
                startedAt: null,
                endedAt: null,
            })),
            startedBy: { userId: "u1", login: "octo" },
            createdAt: NOW_ISO,
            updatedAt: NOW_ISO,
        });
        const response = await GET_ONE(request(), cycleParams("c1"));
        const { data } = (await response.json()) as {
            data: { cycle: { items: { status: string }[] } };
        };

        expect(data.cycle.items.map((item) => item.status)).toEqual([
            "running",
            "pending",
        ]);
        expect(triggerMock).toHaveBeenCalledTimes(1);
        expect(triggerMock).toHaveBeenCalledWith(
            expect.objectContaining({ slug: "alpha", trigger: "cycle" })
        );
    });

    it("answers 404 for a cycle of another board", async () => {
        cycles.set("other", {
            boardId: "b2",
            status: "running",
            options,
            items: [],
            startedBy: { userId: "u9", login: "x" },
            createdAt: NOW_ISO,
            updatedAt: NOW_ISO,
        });
        expect(
            await errorOf(await GET_ONE(request(), cycleParams("other")))
        ).toEqual({ status: 404, code: "CYCLE_NOT_FOUND" });
    });
});

describe("POST /boards/:id/cycles/:cycleId/stop", () => {
    it("stops the cycle and the live run of its card", async () => {
        await create(["alpha", "beta"]);
        cards.documents.set(`${BOARD_ID}__alpha`, {
            ...cards.documents.get(`${BOARD_ID}__alpha`),
            lane: "stage",
            stageKey: "analyze",
            activeRunId: "r1",
            cycleId: "c1",
        });
        const response = await STOP(request({}), cycleParams("c1"));
        const { data } = (await response.json()) as {
            data: { status: string; endReason: string };
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(data).toMatchObject({ status: "stopped", endReason: "stopped" });
        expect(stopRunMock).toHaveBeenCalledWith(
            expect.objectContaining({ slug: "alpha" })
        );
    });

    it("answers 409 for a cycle that already ended", async () => {
        await create(["alpha"]);
        await STOP(request({}), cycleParams("c1"));
        expect(
            await errorOf(await STOP(request({}), cycleParams("c1")))
        ).toEqual({ status: HTTP_STATUS.CONFLICT, code: "CYCLE_NOT_ACTIVE" });
    });

    it("refuses a viewer", async () => {
        await create(["alpha"]);
        access.role = "viewer";
        expect(
            await errorOf(await STOP(request({}), cycleParams("c1")))
        ).toEqual({ status: HTTP_STATUS.FORBIDDEN, code: "BOARD_FORBIDDEN" });
    });
});
