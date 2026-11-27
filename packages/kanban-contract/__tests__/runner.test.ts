import { describe, expect, it } from "vitest";
import { RUN_END_REASONS, STAGE_EXECUTOR_KINDS } from "../src/run";
import {
    formatRunnerCode,
    runnerFinishSchema,
    runnerHeartbeatSchema,
    runnerRegisterSchema,
} from "../src/runner";

const TOO_LONG_NAME = 41;

describe("runnerRegisterSchema", () => {
    it("normalizes a code typed in lower case with the dash", () => {
        const parsed = runnerRegisterSchema.parse({
            code: " kq7m-4xpd ",
            name: "macbook-gui",
        });
        expect(parsed.code).toBe("KQ7M4XPD");
    });

    it("refuses letters outside the alphabet", () => {
        for (const code of [
            "KQ7M-4XPI",
            "KQ7M-4XPL",
            "OQ7M-4XPD",
            "UQ7M-4XPD",
        ]) {
            expect(
                runnerRegisterSchema.safeParse({ code, name: "m" }).success
            ).toBe(false);
        }
    });

    it("refuses a code of the wrong length", () => {
        expect(
            runnerRegisterSchema.safeParse({ code: "KQ7M-4XP", name: "m" })
                .success
        ).toBe(false);
    });

    it("refuses a name with a space or a slash", () => {
        for (const name of ["mac book", "a/b", "", "x".repeat(TOO_LONG_NAME)]) {
            expect(
                runnerRegisterSchema.safeParse({ code: "KQ7M4XPD", name })
                    .success
            ).toBe(false);
        }
    });
});

describe("runner finish and heartbeat", () => {
    it("refuses negative turns and an unknown exit", () => {
        expect(runnerHeartbeatSchema.safeParse({ turns: -1 }).success).toBe(
            false
        );
        expect(
            runnerFinishSchema.safeParse({
                turns: 1,
                durationMs: 10,
                exit: "crashed",
            }).success
        ).toBe(false);
        expect(
            runnerFinishSchema.safeParse({
                turns: -1,
                durationMs: 10,
                exit: "exited",
            }).success
        ).toBe(false);
    });

    it("refuses a session id that could carry markdown", () => {
        expect(
            runnerFinishSchema.safeParse({
                turns: 1,
                durationMs: 10,
                exit: "exited",
                sessionId: "abc`) [x](http://evil)",
            }).success
        ).toBe(false);
    });

    it("accepts a finished run", () => {
        expect(
            runnerFinishSchema.parse({
                turns: 84,
                durationMs: 720_000,
                exit: "exited",
                sessionId: "0b6f1c2e-0000-4000-8000-000000000000",
            }).exit
        ).toBe("exited");
    });
});

describe("runner kinds and reasons", () => {
    it("knows the local executor and the no_runner reason", () => {
        expect(STAGE_EXECUTOR_KINDS).toContain("local");
        expect(RUN_END_REASONS).toContain("no_runner");
        expect(RUN_END_REASONS).toContain("no_credential");
    });

    it("formats a code in two groups", () => {
        expect(formatRunnerCode("KQ7M4XPD")).toBe("KQ7M-4XPD");
    });
});
