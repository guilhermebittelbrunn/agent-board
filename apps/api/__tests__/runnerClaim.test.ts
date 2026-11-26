import { describe, expect, it } from "vitest";
import {
    findUnclaimed,
    isRunnerOnline,
    pickClaimable,
} from "@/(shared)/lib/runner/runner-claim";
import {
    isoAfter,
    isoBefore,
    MINUTE_MS,
    NOW,
    RECENT_MS,
    runFixture,
    runnerFixture,
    SECOND_MS,
    TEN_MINUTES_MS,
    TWO_MINUTES_MS,
} from "./runnerFixtures";

describe("isRunnerOnline", () => {
    it("counts a contact up to 60 s old as online", () => {
        expect(
            isRunnerOnline(
                runnerFixture({ lastSeenAt: isoBefore(MINUTE_MS) }),
                NOW
            )
        ).toBe(true);
        expect(
            isRunnerOnline(
                runnerFixture({ lastSeenAt: isoBefore(MINUTE_MS + 1) }),
                NOW
            )
        ).toBe(false);
    });

    it("never counts a revoked runner", () => {
        expect(
            isRunnerOnline(runnerFixture({ deletedAt: isoBefore(1) }), NOW)
        ).toBe(false);
    });
});

describe("pickClaimable", () => {
    const runner = runnerFixture();

    it("ignores runs of another person, of the fake executor, already claimed or past the deadline", () => {
        const runs = [
            runFixture({
                id: "other",
                triggeredBy: { userId: "u2", login: "x" },
            }),
            runFixture({ id: "fake", executor: "fake" }),
            runFixture({ id: "claimed", runnerId: "runnerB" }),
            runFixture({ id: "late", deadlineAt: isoBefore(1) }),
            runFixture({ id: "queued", status: "queued" }),
        ];
        expect(pickClaimable(runs, runner, NOW)).toBeNull();
    });

    it("takes the oldest run that started", () => {
        const runs = [
            runFixture({ id: "newer", startedAt: isoBefore(SECOND_MS) }),
            runFixture({ id: "older", startedAt: isoBefore(RECENT_MS * 2) }),
        ];
        expect(pickClaimable(runs, runner, NOW)?.id).toBe("older");
    });
});

describe("findUnclaimed", () => {
    it("ends a local run nobody claimed after two minutes, not before", () => {
        const late = runFixture({
            id: "late",
            startedAt: isoBefore(TWO_MINUTES_MS),
        });
        const early = runFixture({
            id: "early",
            startedAt: isoBefore(TWO_MINUTES_MS - 1),
        });
        expect(findUnclaimed([late, early], NOW).map((run) => run.id)).toEqual([
            "late",
        ]);
    });

    it("leaves claimed and fake runs alone", () => {
        const runs = [
            runFixture({
                startedAt: isoBefore(TEN_MINUTES_MS),
                runnerId: "runnerA",
            }),
            runFixture({
                startedAt: isoBefore(TEN_MINUTES_MS),
                executor: "fake",
            }),
            runFixture({
                startedAt: isoBefore(TEN_MINUTES_MS),
                deadlineAt: isoAfter(1),
                status: "queued",
            }),
        ];
        expect(findUnclaimed(runs, NOW)).toEqual([]);
    });
});
