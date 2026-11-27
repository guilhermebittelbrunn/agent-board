import { describe, expect, it } from "vitest";
import { type BoardConfig, parseBoardConfig } from "../src/boardConfig";
import {
    advanceCycle,
    type CycleOptions,
    type CycleState,
    createCycleInputSchema,
    cycleHoldStageKey,
    cycleItemResult,
    MAX_CYCLE_SPECS,
    stopCycleItems,
} from "../src/cycle";

const AT = "2026-11-27T22:00:00.000Z";

function config(stages: unknown[]): BoardConfig {
    const result = parseBoardConfig({ version: 1, name: "board", stages });
    if (!result.success) {
        throw new Error("fixture must be valid");
    }
    return result.data;
}

const withPullRequest = config([
    { key: "analyze", column: "Análise", command: "/analyze" },
    { key: "test", column: "Testando", command: "/test" },
    {
        key: "pr",
        column: "Aguardando PR",
        command: "/observe",
        pullRequest: {},
    },
]);

const withoutPullRequest = config([
    { key: "analyze", column: "Análise", command: "/analyze" },
    { key: "test", column: "Testando", command: "/test" },
]);

const options = (overrides: Partial<CycleOptions> = {}): CycleOptions => ({
    until: "pull_request",
    concurrency: 1,
    onFailure: "skip",
    ...overrides,
});

function cycle(
    slugs: string[],
    overrides: Partial<CycleOptions> = {}
): CycleState {
    return {
        status: "running",
        endReason: null,
        options: options(overrides),
        items: slugs.map((slug) => ({
            slug,
            status: "pending",
            code: null,
            startedAt: null,
            endedAt: null,
        })),
    };
}

const statuses = (state: CycleState) => state.items.map((item) => item.status);

describe("createCycleInputSchema", () => {
    const valid = { slugs: ["a", "b"], options: options() };

    it("accepts one to ten unique slugs", () => {
        expect(createCycleInputSchema.safeParse(valid).success).toBe(true);
        const ten = Array.from({ length: MAX_CYCLE_SPECS }, (_, i) => `s${i}`);
        expect(
            createCycleInputSchema.safeParse({ ...valid, slugs: ten }).success
        ).toBe(true);
    });

    it("refuses an empty list, eleven slugs and duplicates", () => {
        const eleven = Array.from(
            { length: MAX_CYCLE_SPECS + 1 },
            (_, i) => `s${i}`
        );
        for (const slugs of [[], eleven, ["a", "a"], ["Not A Slug"]]) {
            expect(
                createCycleInputSchema.safeParse({ ...valid, slugs }).success
            ).toBe(false);
        }
    });

    it("refuses options outside the lists", () => {
        for (const bad of [
            { until: "done" },
            { concurrency: 3 },
            { onFailure: "retry" },
        ]) {
            expect(
                createCycleInputSchema.safeParse({
                    ...valid,
                    options: { ...options(), ...bad },
                }).success
            ).toBe(false);
        }
    });
});

describe("cycleHoldStageKey", () => {
    it("lets the card reach the pull request stage", () => {
        expect(cycleHoldStageKey(withPullRequest, "pull_request")).toBeNull();
    });

    it("stops on the stage before the pull request one", () => {
        expect(cycleHoldStageKey(withPullRequest, "testing")).toBe("test");
    });

    it("stops on the last stage when there is no pull request stage", () => {
        expect(cycleHoldStageKey(withoutPullRequest, "testing")).toBe("test");
    });
});

describe("cycleItemResult", () => {
    it("keeps the item running while another stage was queued", () => {
        expect(cycleItemResult({ state: "queued" }, true)).toBeNull();
    });

    it("maps where the card stopped", () => {
        expect(cycleItemResult({ state: "idle" }, false)).toBe("done");
        expect(cycleItemResult({ state: "waiting_input" }, false)).toBe(
            "waiting_input"
        );
        expect(cycleItemResult({ state: "failed" }, false)).toBe("failed");
    });
});

describe("advanceCycle", () => {
    it("starts one item at a time with concurrency 1", () => {
        const first = advanceCycle(cycle(["a", "b", "c"]), null, AT);
        expect(first.start).toEqual(["a"]);
        expect(statuses(first.cycle)).toEqual([
            "running",
            "pending",
            "pending",
        ]);

        const second = advanceCycle(
            first.cycle,
            { slug: "a", result: "done" },
            AT
        );
        expect(second.start).toEqual(["b"]);
        expect(statuses(second.cycle)).toEqual(["done", "running", "pending"]);
    });

    it("fills two slots with concurrency 2", () => {
        const first = advanceCycle(
            cycle(["a", "b", "c"], { concurrency: 2 }),
            null,
            AT
        );
        expect(first.start).toEqual(["a", "b"]);
        const again = advanceCycle(first.cycle, null, AT);
        expect(again.start).toEqual([]);
    });

    it("goes on after a failure with skip", () => {
        const first = advanceCycle(cycle(["a", "b"]), null, AT);
        const next = advanceCycle(
            first.cycle,
            { slug: "a", result: "failed", code: "CARD_NOT_READY" },
            AT
        );
        expect(next.start).toEqual(["b"]);
        expect(next.cycle.items[0]).toMatchObject({
            status: "failed",
            code: "CARD_NOT_READY",
            endedAt: AT,
        });
    });

    it("stops the cycle after a failure with stop", () => {
        const first = advanceCycle(
            cycle(["a", "b", "c"], { concurrency: 2, onFailure: "stop" }),
            null,
            AT
        );
        const next = advanceCycle(
            first.cycle,
            { slug: "a", result: "failed" },
            AT
        );
        expect(next.ended).toBe(true);
        expect(next.start).toEqual([]);
        expect(next.cycle.status).toBe("stopped");
        expect(next.cycle.endReason).toBe("item_failed");
        expect(statuses(next.cycle)).toEqual(["failed", "running", "skipped"]);
    });

    it("does not count waiting for a person or a stop as a failure", () => {
        const first = advanceCycle(
            cycle(["a", "b", "c"], { onFailure: "stop" }),
            null,
            AT
        );
        const waiting = advanceCycle(
            first.cycle,
            { slug: "a", result: "waiting_input" },
            AT
        );
        expect(waiting.start).toEqual(["b"]);
        const stopped = advanceCycle(
            waiting.cycle,
            { slug: "b", result: "stopped" },
            AT
        );
        expect(stopped.start).toEqual(["c"]);
        expect(stopped.cycle.status).toBe("running");
    });

    it("finishes once no item is pending or running", () => {
        const first = advanceCycle(cycle(["a"]), null, AT);
        const done = advanceCycle(
            first.cycle,
            { slug: "a", result: "done" },
            AT
        );
        expect(done.ended).toBe(true);
        expect(done.cycle.status).toBe("finished");
        expect(done.cycle.endReason).toBe("completed");
    });

    it("ignores a result for an item that is not running", () => {
        const first = advanceCycle(cycle(["a", "b"]), null, AT);
        const ignored = advanceCycle(
            first.cycle,
            { slug: "b", result: "failed" },
            AT
        );
        expect(statuses(ignored.cycle)).toEqual(["running", "pending"]);
        expect(ignored.start).toEqual([]);
    });

    it("records a late result on a cycle that ended, starting nothing", () => {
        const first = advanceCycle(cycle(["a", "b"]), null, AT);
        const stoppedCycle: CycleState = { ...first.cycle, status: "stopped" };
        const late = advanceCycle(
            stoppedCycle,
            { slug: "a", result: "done" },
            AT
        );
        expect(late.start).toEqual([]);
        expect(late.ended).toBe(false);
        expect(statuses(late.cycle)).toEqual(["done", "pending"]);
    });

    it("starts nothing on a queued cycle", () => {
        const queued: CycleState = { ...cycle(["a"]), status: "queued" };
        expect(advanceCycle(queued, null, AT).start).toEqual([]);
    });
});

describe("stopCycleItems", () => {
    it("skips the pending and stops the running", () => {
        const first = advanceCycle(cycle(["a", "b"]), null, AT);
        expect(
            stopCycleItems(first.cycle.items, AT).map((item) => item.status)
        ).toEqual(["stopped", "skipped"]);
    });
});
