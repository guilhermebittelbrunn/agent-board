import { describe, expect, it } from "vitest";
import {
    type CardLastRun,
    type CardRunActionsInput,
    cardRunActions,
} from "../src/run";

const lastRun = (overrides: Partial<CardLastRun> = {}): CardLastRun => ({
    id: "r1",
    stageKey: "analyze",
    status: "finished",
    outcome: "success",
    endReason: "agent",
    stoppedByLogin: null,
    finishedAt: "2026-11-26T10:00:00.000Z",
    ...overrides,
});

const card = (
    overrides: Partial<CardRunActionsInput> = {}
): CardRunActionsInput => ({
    lane: "stage",
    stageKey: "analyze",
    state: "idle",
    activeRunId: null,
    pendingAsk: null,
    lastRun: null,
    ...overrides,
});

const operator = { canTrigger: true, executorAvailable: true };
const none = { rerun: false, stop: false, approve: false };

describe("cardRunActions", () => {
    it("only offers to stop a card with an active run", () => {
        expect(
            cardRunActions(
                card({ activeRunId: "r1", state: "running" }),
                operator
            )
        ).toEqual({ rerun: false, stop: true, approve: false });
        expect(
            cardRunActions(
                card({ activeRunId: "r1", state: "queued" }),
                operator
            )
        ).toEqual({ rerun: false, stop: true, approve: false });
    });

    it("offers to run a failed card again", () => {
        expect(
            cardRunActions(
                card({
                    state: "failed",
                    lastRun: lastRun({ outcome: "failed" }),
                }),
                operator
            )
        ).toEqual({ rerun: true, stop: false, approve: false });
    });

    it("offers to run a stopped card again", () => {
        expect(
            cardRunActions(
                card({
                    lastRun: lastRun({
                        status: "stopped",
                        outcome: null,
                        endReason: "stopped",
                        stoppedByLogin: "octo",
                    }),
                }),
                operator
            ).rerun
        ).toBe(true);
    });

    it("offers to run again a card waiting without a pending question", () => {
        expect(
            cardRunActions(card({ state: "waiting_input" }), operator).rerun
        ).toBe(true);
        expect(
            cardRunActions(
                card({
                    state: "waiting_input",
                    pendingAsk: {
                        eventId: "e1",
                        stageKey: "analyze",
                        count: 1,
                    },
                }),
                operator
            )
        ).toEqual(none);
    });

    it("offers approval when the previous stage succeeded and the card waits in the next one", () => {
        expect(
            cardRunActions(
                card({
                    stageKey: "develop",
                    lastRun: lastRun({ stageKey: "analyze" }),
                }),
                operator
            )
        ).toEqual({ rerun: false, stop: false, approve: true });
    });

    it("offers to run a stage card that never ran", () => {
        expect(cardRunActions(card(), operator).rerun).toBe(true);
    });

    it("offers nothing to a stage card idle after its own successful run", () => {
        expect(cardRunActions(card({ lastRun: lastRun() }), operator)).toEqual(
            none
        );
    });

    it("offers nothing outside the stage columns", () => {
        expect(
            cardRunActions(card({ lane: "tasks", stageKey: null }), operator)
        ).toEqual(none);
        expect(
            cardRunActions(
                card({ lane: "done", stageKey: null, state: "failed" }),
                operator
            )
        ).toEqual(none);
    });

    it("offers to run a spec draft again, but never approval between rounds", () => {
        const draft = card({ lane: "drafts", stageKey: "spec" });

        expect(cardRunActions(draft, operator).rerun).toBe(true);
        expect(
            cardRunActions({ ...draft, state: "failed" }, operator).rerun
        ).toBe(true);
        expect(
            cardRunActions(
                { ...draft, lastRun: lastRun({ stageKey: "analyze" }) },
                operator
            ).approve
        ).toBe(false);
    });

    it("offers nothing to who cannot trigger, nor without an executor", () => {
        const failed = card({ state: "failed" });
        const running = card({ activeRunId: "r1", state: "running" });

        for (const options of [
            { canTrigger: false, executorAvailable: true },
            { canTrigger: true, executorAvailable: false },
        ]) {
            expect(cardRunActions(failed, options)).toEqual(none);
            expect(cardRunActions(running, options)).toEqual(none);
        }
    });
});
