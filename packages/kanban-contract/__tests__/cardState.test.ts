import { describe, expect, it } from "vitest";
import { type BoardConfig, parseBoardConfig } from "../src/boardConfig";
import { resolveTransition } from "../src/cardState";

function buildConfig(): BoardConfig {
    const result = parseBoardConfig({
        version: 1,
        name: "next-boilerplate",
        stages: [
            {
                key: "analyze",
                column: "Análise",
                command: "/analyze",
                approval: "optional",
            },
            { key: "develop", column: "Executando", command: "/develop" },
            {
                key: "review",
                column: "Revisando",
                command: "/review",
                onRework: "develop",
            },
            {
                key: "test",
                column: "Testando",
                command: "/test",
                onRework: "develop",
            },
        ],
    });
    if (!result.success) {
        throw new Error("fixture must be valid");
    }
    return result.data;
}

const config = buildConfig();

describe("resolveTransition", () => {
    it("queues the next stage after a success", () => {
        const next = resolveTransition({
            config,
            current: { stageKey: "develop", state: "running", reworkLoops: 0 },
            outcome: "success",
            approvalGateEnabled: false,
        });

        expect(next).toEqual({
            stageKey: "review",
            state: "queued",
            reworkLoops: 0,
        });
    });

    it("waits for a human when the approval gate is on", () => {
        const next = resolveTransition({
            config,
            current: { stageKey: "analyze", state: "running", reworkLoops: 0 },
            outcome: "success",
            approvalGateEnabled: true,
        });

        expect(next.stageKey).toBe("develop");
        expect(next.state).toBe("idle");
    });

    it("sends the card back to develop on rework", () => {
        const next = resolveTransition({
            config,
            current: { stageKey: "test", state: "running", reworkLoops: 1 },
            outcome: "needs_rework",
            approvalGateEnabled: false,
        });

        expect(next).toEqual({
            stageKey: "develop",
            state: "queued",
            reworkLoops: 2,
        });
    });

    it("stops looping after the rework limit", () => {
        const next = resolveTransition({
            config,
            current: { stageKey: "review", state: "running", reworkLoops: 2 },
            outcome: "needs_rework",
            approvalGateEnabled: false,
        });

        expect(next).toEqual({
            stageKey: "review",
            state: "waiting_input",
            reworkLoops: 2,
        });
    });

    it("keeps the card in place when the agent asks a question", () => {
        const next = resolveTransition({
            config,
            current: { stageKey: "analyze", state: "running", reworkLoops: 0 },
            outcome: "needs_input",
            approvalGateEnabled: false,
        });

        expect(next.state).toBe("waiting_input");
        expect(next.stageKey).toBe("analyze");
    });

    it("finishes the pipeline after the last stage", () => {
        const next = resolveTransition({
            config,
            current: { stageKey: "test", state: "running", reworkLoops: 0 },
            outcome: "success",
            approvalGateEnabled: false,
        });

        expect(next.stageKey).toBeNull();
        expect(next.state).toBe("idle");
    });
});
