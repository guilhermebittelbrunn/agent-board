import { describe, expect, it } from "vitest";
import {
    chooseStageExecutor,
    scheduledTaskIdOf,
    scheduledTaskInputSchema,
    stageAcceptsRunner,
    stageRunnersOf,
} from "../src/credential";

const FIRE_URL =
    "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGH/fire";
const TOKEN = "test-token-0123456789-abcd";

describe("scheduledTaskInputSchema", () => {
    it("accepts the documented fire URL and trims both fields", () => {
        const parsed = scheduledTaskInputSchema.parse({
            fireUrl: ` ${FIRE_URL} `,
            token: ` ${TOKEN} `,
        });
        expect(parsed).toEqual({ fireUrl: FIRE_URL, token: TOKEN });
    });

    it.each([
        ["another host", "https://example.com/fire"],
        [
            "a look-alike host",
            "https://api.anthropic.com.evil.test/v1/claude_code/routines/trig_01/fire",
        ],
        [
            "plain http",
            "http://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire",
        ],
        [
            "a path without /fire",
            "https://api.anthropic.com/v1/claude_code/routines/trig_01ABC",
        ],
        [
            "an id without trig_",
            "https://api.anthropic.com/v1/claude_code/routines/01ABC/fire",
        ],
        [
            "a query string",
            "https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire?x=1",
        ],
        [
            "credentials in the URL",
            "https://user:pass@api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire",
        ],
        [
            "an explicit port",
            "https://api.anthropic.com:8443/v1/claude_code/routines/trig_01ABC/fire",
        ],
        [
            "a path traversal",
            "https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/../../x/fire",
        ],
        [
            "a trailing newline",
            "https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire\n/evil",
        ],
    ])("refuses %s", (_label, fireUrl) => {
        expect(
            scheduledTaskInputSchema.safeParse({ fireUrl, token: TOKEN })
                .success
        ).toBe(false);
    });

    it("refuses a token shorter than 20 characters", () => {
        expect(
            scheduledTaskInputSchema.safeParse({
                fireUrl: FIRE_URL,
                token: "short",
            }).success
        ).toBe(false);
    });
});

describe("scheduledTaskIdOf", () => {
    it("extracts the trigger id", () => {
        expect(scheduledTaskIdOf(FIRE_URL)).toBe("trig_01ABCDEFGH");
    });

    it("returns null for a URL outside the format", () => {
        expect(scheduledTaskIdOf("https://example.com/fire")).toBeNull();
    });
});

describe("stageAcceptsRunner", () => {
    it("reads the stage runners", () => {
        expect(stageAcceptsRunner({ runners: ["cloud"] }, "cloud")).toBe(true);
        expect(stageAcceptsRunner({ runners: ["cloud"] }, "local")).toBe(false);
    });
});

describe("stageRunnersOf", () => {
    const config = {
        stages: [{ runners: ["cloud" as const], key: "analyze" }] as never,
        specAuthoring: { runners: ["local" as const] } as never,
    };

    it("reads a stage by key and the spec stage from specAuthoring", () => {
        expect(stageRunnersOf(config, "analyze")?.runners).toEqual(["cloud"]);
        expect(stageRunnersOf(config, "spec")?.runners).toEqual(["local"]);
        expect(stageRunnersOf(config, "missing")).toBeUndefined();
    });
});

describe("chooseStageExecutor", () => {
    it("picks the local runner when the stage accepts it and one is online", () => {
        expect(
            chooseStageExecutor({
                stageRunners: ["local", "cloud"],
                hasOnlineRunner: true,
                emulated: true,
            })
        ).toEqual({ ok: true, executor: "local" });
    });

    it("falls back to the fake executor only in the emulator", () => {
        expect(
            chooseStageExecutor({
                stageRunners: ["local"],
                hasOnlineRunner: false,
                emulated: true,
            })
        ).toEqual({ ok: true, executor: "fake" });
        expect(
            chooseStageExecutor({
                stageRunners: ["cloud"],
                hasOnlineRunner: true,
                emulated: true,
            })
        ).toEqual({ ok: true, executor: "fake" });
    });

    it("refuses with no_executor when a runner coming online would serve the stage", () => {
        expect(
            chooseStageExecutor({
                stageRunners: ["local", "cloud"],
                hasOnlineRunner: false,
                emulated: false,
            })
        ).toEqual({ ok: false, refusal: "no_executor" });
    });

    it.each([true, false])(
        "refuses a cloud-only stage outside the emulator (runner online: %s)",
        (hasOnlineRunner) => {
            expect(
                chooseStageExecutor({
                    stageRunners: ["cloud"],
                    hasOnlineRunner,
                    emulated: false,
                })
            ).toEqual({ ok: false, refusal: "stage_not_served" });
        }
    );

    it("refuses a github-actions-only stage even in the emulator", () => {
        expect(
            chooseStageExecutor({
                stageRunners: ["github-actions"],
                hasOnlineRunner: true,
                emulated: true,
            })
        ).toEqual({ ok: false, refusal: "stage_not_served" });
    });
});
