import { describe, expect, it } from "vitest";
import { createTurnCounter, readStreamLine } from "../src/turns.ts";

const assistant = (id: string | null, parent: string | null = null) =>
    JSON.stringify({
        type: "assistant",
        parent_tool_use_id: parent,
        message: {
            ...(id ? { id } : {}),
            content: [{ type: "tool_use", name: "Bash" }],
        },
    });

describe("turn counting", () => {
    it("counts only assistant messages of the main session, once per message id", () => {
        const counter = createTurnCounter();
        for (const line of [
            JSON.stringify({
                type: "system",
                subtype: "init",
                session_id: "s-1",
            }),
            assistant("m1"),
            assistant("m1"),
            assistant("m2"),
            assistant("sub", "toolu_1"),
            JSON.stringify({ type: "user", message: {} }),
            "not json",
            "",
        ]) {
            counter.observe(line);
        }
        expect(counter.turns).toBe(2);
        expect(counter.sessionId).toBe("s-1");
    });

    it("reads tool names, the cost and a turn limit hit by the CLI", () => {
        expect(readStreamLine(assistant("m1"))).toEqual({
            kind: "assistant",
            messageId: "m1",
            tools: ["Bash"],
        });
        expect(
            readStreamLine(
                JSON.stringify({
                    type: "result",
                    subtype: "error_max_turns",
                    total_cost_usd: 0.5,
                })
            )
        ).toEqual({ kind: "result", costUsd: 0.5, maxTurnsReached: true });
        expect(readStreamLine("{oops")).toBeNull();
    });
});
