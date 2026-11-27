import { describe, expect, it } from "vitest";
import { createActivityLog } from "../src/activity.ts";

const WORKTREE = "/home/u/.agent-board-runner/worktrees/run1";
const line = (value: object) => JSON.stringify(value);

describe("createActivityLog", () => {
    it("names each tool with what it works on, relative to the worktree", () => {
        const activity = createActivityLog(WORKTREE);
        expect(
            activity.describe(
                line({
                    type: "assistant",
                    parent_tool_use_id: null,
                    message: {
                        content: [
                            {
                                type: "text",
                                text: "Lendo a spec\nantes de planejar.",
                            },
                            {
                                type: "tool_use",
                                id: "t1",
                                name: "Read",
                                input: {
                                    file_path: `${WORKTREE}/specs/features/a.md`,
                                },
                            },
                            {
                                type: "tool_use",
                                id: "t2",
                                name: "Bash",
                                input: {
                                    command: "git status",
                                    description: "Check branch",
                                },
                            },
                            {
                                type: "tool_use",
                                id: "t3",
                                name: "mcp__kanban__complete_stage",
                                input: { outcome: "success" },
                            },
                        ],
                    },
                })
            )
        ).toEqual([
            "  » Lendo a spec antes de planejar.",
            "  · Read  specs/features/a.md",
            "  · Bash  Check branch",
            "  · mcp__kanban__complete_stage  success",
        ]);
    });

    it("indents what a subagent does and leaves out its text", () => {
        const activity = createActivityLog(WORKTREE);
        expect(
            activity.describe(
                line({
                    type: "assistant",
                    parent_tool_use_id: "agent1",
                    message: {
                        content: [
                            { type: "text", text: "pensando" },
                            {
                                type: "tool_use",
                                id: "s1",
                                name: "Grep",
                                input: { pattern: "isCardReady" },
                            },
                        ],
                    },
                })
            )
        ).toEqual(["      ↳ Grep  isCardReady"]);
    });

    it("reports a denied permission once and a failed tool by name", () => {
        const activity = createActivityLog(WORKTREE);
        activity.describe(
            line({
                type: "assistant",
                message: {
                    content: [
                        {
                            type: "tool_use",
                            id: "k1",
                            name: "mcp__kanban__get_card",
                            input: {},
                        },
                        {
                            type: "tool_use",
                            id: "b1",
                            name: "Bash",
                            input: { command: "pnpm test" },
                        },
                    ],
                },
            })
        );
        expect(
            activity.describe(
                line({
                    type: "system",
                    subtype: "permission_denied",
                    tool_name: "mcp__kanban__get_card",
                    tool_use_id: "k1",
                })
            )
        ).toEqual(["  ✗ permissão negada: mcp__kanban__get_card"]);
        expect(
            activity.describe(
                line({
                    type: "user",
                    message: {
                        content: [
                            {
                                type: "tool_result",
                                tool_use_id: "k1",
                                is_error: true,
                                content: "Claude requested permissions",
                            },
                            {
                                type: "tool_result",
                                tool_use_id: "b1",
                                is_error: true,
                                content: [{ type: "text", text: "exit 1" }],
                            },
                        ],
                    },
                })
            )
        ).toEqual(["  ✗ Bash falhou: exit 1"]);
    });

    it("ignores lines that are not JSON and quiet events", () => {
        const activity = createActivityLog(WORKTREE);
        expect(
            activity.describe("Ignoring 37 permissions.allow entries")
        ).toEqual([]);
        expect(
            activity.describe(line({ type: "system", subtype: "hook_started" }))
        ).toEqual([]);
        expect(
            activity.describe(line({ type: "result", subtype: "success" }))
        ).toEqual([]);
    });
});
