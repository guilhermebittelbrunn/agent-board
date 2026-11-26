import { describe, expect, it } from "vitest";
import {
    ACTIVE_RUN_REFETCH_MS,
    activeRunRefetchInterval,
    countRuns,
    hasActiveRun,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/hasActiveRun";

describe("hasActiveRun", () => {
    it("polls only while a card is queued or running", () => {
        expect(hasActiveRun(undefined)).toBe(false);
        expect(hasActiveRun([{ state: "idle" }, { state: "failed" }])).toBe(
            false
        );
        expect(hasActiveRun([{ state: "idle" }, { state: "queued" }])).toBe(
            true
        );
        expect(hasActiveRun({ state: "running" })).toBe(true);
        expect(hasActiveRun({ state: "waiting_input" })).toBe(false);

        expect(activeRunRefetchInterval([{ state: "running" }])).toBe(
            ACTIVE_RUN_REFETCH_MS
        );
        expect(activeRunRefetchInterval([{ state: "idle" }])).toBe(false);
    });

    it("counts running and queued cards for the board summary", () => {
        expect(
            countRuns([
                { state: "running" },
                { state: "running" },
                { state: "queued" },
                { state: "failed" },
            ])
        ).toEqual({ running: 2, queued: 1 });
    });
});
