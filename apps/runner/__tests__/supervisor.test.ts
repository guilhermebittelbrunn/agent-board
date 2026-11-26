import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type SupervisorInput, superviseAgent } from "../src/supervisor.ts";

const script = (turns: number, hang: boolean) => `
const emit = (r) => process.stdout.write(JSON.stringify(r) + "\\n");
emit({ type: "system", subtype: "init", session_id: "sess-1" });
for (let i = 1; i <= ${turns}; i++) {
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "m" + i, content: [] } });
}
${hang ? "setInterval(() => {}, 1000);" : 'emit({ type: "result", subtype: "success", total_cost_usd: 0.25 });'}
`;

const MINUTE_MS = 60_000;
const TURNS = 3;
const LINES_WITH_INIT_AND_RESULT = 5;
const MAX_TURNS = 5;
const TURNS_PAST_LIMIT = 9;
const SHORT_MS = 150;

const dirs: string[] = [];

afterAll(async () => {
    await Promise.all(
        dirs.map((dir) => rm(dir, { recursive: true, force: true }))
    );
});

async function supervise(
    turns: number,
    hang: boolean,
    overrides: Partial<SupervisorInput> = {}
) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "runner-supervisor-"));
    dirs.push(dir);
    const logFile = path.join(dir, "run.jsonl");
    const result = await superviseAgent({
        command: process.execPath,
        args: ["-e", script(turns, hang)],
        cwd: dir,
        env: { PATH: process.env.PATH },
        maxTurns: MAX_TURNS,
        deadlineAt: new Date(Date.now() + MINUTE_MS),
        heartbeat: () => Promise.resolve({ active: true }),
        logFile,
        signal: new AbortController().signal,
        heartbeatIntervalMs: 50,
        killGraceMs: 500,
        ...overrides,
    });
    return { result, log: await readFile(logFile, "utf8") };
}

describe("superviseAgent", () => {
    it("reports a session that exits on its own, with turns, session and cost", async () => {
        const { result, log } = await supervise(TURNS, false);
        expect(result).toMatchObject({
            exit: "exited",
            turns: TURNS,
            sessionId: "sess-1",
            exitCode: 0,
            costUsd: 0.25,
        });
        expect(log.split("\n").filter(Boolean)).toHaveLength(
            LINES_WITH_INIT_AND_RESULT
        );
    });

    it("stops the session one turn past the limit", async () => {
        const { result } = await supervise(TURNS_PAST_LIMIT, true);
        expect(result.exit).toBe("turn_limit");
        expect(result.turns).toBe(MAX_TURNS + 1);
    });

    it("stops when the heartbeat says the run was stopped on the board", async () => {
        const { result } = await supervise(1, true, {
            heartbeat: () => Promise.resolve({ active: false }),
        });
        expect(result.exit).toBe("stopped");
    });

    it("stops with an error when the runner was revoked", async () => {
        const { result } = await supervise(1, true, {
            heartbeat: () => Promise.resolve({ revoked: true }),
        });
        expect(result.exit).toBe("error");
    });

    it("reports Ctrl+C as interrupted", async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), SHORT_MS);
        const { result } = await supervise(1, true, {
            signal: controller.signal,
        });
        expect(result.exit).toBe("interrupted");
    });

    it("stops at the stage deadline", async () => {
        const { result } = await supervise(1, true, {
            deadlineAt: new Date(Date.now() + SHORT_MS),
        });
        expect(result.exit).toBe("deadline");
    });
});
