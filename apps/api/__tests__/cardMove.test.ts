import { describe, expect, it } from "vitest";
import { decideCardMove } from "@/(shared)/lib/card-move";

const readyInTasks = {
    lane: "tasks" as const,
    ready: true,
    activeRunId: null,
};

describe("decideCardMove", () => {
    it("lets a ready card leave Tasks for Done", () => {
        expect(decideCardMove(readyInTasks, { lane: "done" })).toEqual({
            ok: true,
            unchanged: false,
        });
    });

    it("keeps a card that is not ready in Tasks", () => {
        const notReady = { ...readyInTasks, ready: false };

        expect(decideCardMove(notReady, { lane: "done" })).toEqual({
            ok: false,
            code: "CARD_NOT_READY",
            status: 409,
        });
        expect(decideCardMove(notReady, { lane: "tasks" })).toEqual({
            ok: true,
            unchanged: true,
        });
    });

    it("lets a card already out of Tasks move even after its spec stopped being ready", () => {
        const started = {
            lane: "stage" as const,
            ready: false,
            activeRunId: null,
        };

        expect(decideCardMove(started, { lane: "done" })).toEqual({
            ok: true,
            unchanged: false,
        });
        expect(decideCardMove(started, { lane: "tasks" })).toEqual({
            ok: true,
            unchanged: false,
        });
    });

    it("reports a move to the same column as unchanged", () => {
        const done = { lane: "done" as const, ready: true, activeRunId: null };

        expect(decideCardMove(done, { lane: "done" })).toEqual({
            ok: true,
            unchanged: true,
        });
    });

    it("keeps a card with a live run where it is", () => {
        const running = {
            lane: "stage" as const,
            ready: true,
            activeRunId: "r1",
        };

        for (const lane of ["tasks", "done"] as const) {
            expect(decideCardMove(running, { lane })).toEqual({
                ok: false,
                code: "CARD_RUN_ACTIVE",
                status: 409,
            });
        }
    });
});
