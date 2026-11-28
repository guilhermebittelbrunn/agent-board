import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunnerApi } from "../src/api.ts";
import { sweepLeftoverRuns } from "../src/leftovers.ts";
import { redactHome } from "../src/report.ts";
import { reportLeftovers } from "../src/run-job.ts";

const OLD_MS = 3_600_000;
let root = "";
const children: ChildProcess[] = [];

afterEach(async () => {
    for (const child of children.splice(0)) {
        child.kill("SIGKILL");
    }
    if (root !== "") {
        await rm(root, { recursive: true, force: true });
    }
});

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function exitedPid(): Promise<number> {
    const child = spawn(process.execPath, ["-e", ""]);
    return new Promise((resolve) =>
        child.on("exit", () => resolve(child.pid ?? 0))
    );
}

async function layout() {
    root = await mkdtemp(path.join(os.tmpdir(), "runner-leftovers-"));
    const paths = {
        runs: path.join(root, "runs"),
        worktrees: path.join(root, "worktrees"),
    };
    const addRun = async (runId: string, files: Record<string, string>) => {
        const runDir = path.join(paths.runs, runId);
        await mkdir(runDir, { recursive: true });
        await mkdir(path.join(paths.worktrees, runId), { recursive: true });
        for (const [name, content] of Object.entries(files)) {
            await writeFile(path.join(runDir, name), content);
        }
        return runDir;
    };
    return { paths, addRun };
}

describe("sweepLeftoverRuns", () => {
    it("kills the agent of a dead runner and removes its token file and worktree", async () => {
        const { paths, addRun } = await layout();
        const agent = spawn(
            process.execPath,
            ["-e", "setInterval(() => {}, 1000)"],
            {
                detached: true,
                stdio: "ignore",
            }
        );
        children.push(agent);
        const agentExited = new Promise((resolve) => agent.on("exit", resolve));
        await addRun("run1", {
            "runner.pid": String(await exitedPid()),
            "agent.pid": String(agent.pid),
            "mcp.json": "{}",
        });

        expect(await sweepLeftoverRuns(paths)).toEqual([
            { runId: "run1", run: null },
        ]);

        await agentExited;
        expect(isAlive(agent.pid ?? 0)).toBe(false);
        expect(existsSync(path.join(paths.runs, "run1"))).toBe(false);
        expect(existsSync(path.join(paths.worktrees, "run1"))).toBe(false);
    });

    it("leaves the run of another live runner sharing the home", async () => {
        const { paths, addRun } = await layout();
        await addRun("run2", {
            "runner.pid": String(process.ppid),
            "mcp.json": "{}",
        });

        expect(await sweepLeftoverRuns(paths)).toEqual([]);
        expect(existsSync(path.join(paths.runs, "run2", "mcp.json"))).toBe(
            true
        );
    });

    it("treats a run of this same process as a leftover", async () => {
        const { paths, addRun } = await layout();
        await addRun("run3", { "runner.pid": String(process.pid) });

        expect(await sweepLeftoverRuns(paths)).toEqual([
            { runId: "run3", run: null },
        ]);
    });

    it("waits before removing a fresh run folder without a pid file", async () => {
        const { paths, addRun } = await layout();
        const fresh = await addRun("run4", {});
        const stale = await addRun("run5", {});
        const past = new Date(Date.now() - OLD_MS);
        await utimes(stale, past, past);

        expect(await sweepLeftoverRuns(paths)).toEqual([
            { runId: "run5", run: null },
        ]);
        expect(existsSync(fresh)).toBe(true);
    });
});

describe("reportLeftovers", () => {
    const leftoverRun = {
        cardId: "agent-board-demo--sample-app__search-cards",
        stageKey: "analyze",
        command: "/analyze",
        slug: "search-cards",
        runToken: "kbr_run7_secret",
    };

    function fakeApi(fail = false) {
        const calls: { token: string; name: string; input: unknown }[] = [];
        const api = {
            tool: (token: string, name: string, input: unknown) => {
                calls.push({ token, name, input });
                return fail
                    ? Promise.reject(new Error("RUN_TOKEN_EXPIRED"))
                    : Promise.resolve({});
            },
        } as unknown as RunnerApi;
        return { api, calls };
    }

    it("closes the stage of a run its runner died in, with that run's own token", async () => {
        const { paths, addRun } = await layout();
        await addRun("run7", {
            "runner.pid": String(await exitedPid()),
            "run.json": JSON.stringify(leftoverRun),
        });
        const leftovers = await sweepLeftoverRuns(paths);
        expect(leftovers).toEqual([{ runId: "run7", run: leftoverRun }]);

        const { api, calls } = fakeApi();
        const lines: string[] = [];
        await reportLeftovers(leftovers, {
            api,
            runner: { name: "mac", id: "c704GbOe9oeb" },
            log: (line) => lines.push(line),
        });

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            token: "kbr_run7_secret",
            name: "complete_stage",
            input: {
                cardId: leftoverRun.cardId,
                stage: "analyze",
                outcome: "failed",
            },
        });
        expect(JSON.stringify(calls[0]?.input)).toContain("`c704Gb`");
        expect(lines.join("\n")).toContain("avisou o board");
    });

    it("names the runner that took the run, not the one cleaning up", async () => {
        const { paths, addRun } = await layout();
        const deadRunner = { name: "mac", id: "aaaaaa11" };
        await addRun("run10", {
            "runner.pid": String(await exitedPid()),
            "run.json": JSON.stringify({ ...leftoverRun, runner: deadRunner }),
        });
        const leftovers = await sweepLeftoverRuns(paths);
        expect(leftovers).toEqual([
            { runId: "run10", run: { ...leftoverRun, runner: deadRunner } },
        ]);

        const { api, calls } = fakeApi();
        await reportLeftovers(leftovers, {
            api,
            runner: { name: "mac-2", id: "bbbbbb22" },
            log: () => null,
        });

        const summary = JSON.stringify(calls[0]?.input);
        expect(summary).toContain("`mac` (id `aaaaaa`)");
        expect(summary).not.toContain("bbbbbb");
    });

    it("falls back to the cleaning runner when the run file has no valid runner", async () => {
        const { paths, addRun } = await layout();
        await addRun("run11", {
            "runner.pid": String(await exitedPid()),
            "run.json": JSON.stringify({
                ...leftoverRun,
                runner: { name: "mac" },
            }),
        });
        const leftovers = await sweepLeftoverRuns(paths);
        expect(leftovers).toEqual([{ runId: "run11", run: leftoverRun }]);

        const { api, calls } = fakeApi();
        await reportLeftovers(leftovers, {
            api,
            runner: { name: "mac-2", id: "bbbbbb22" },
            log: () => null,
        });

        expect(JSON.stringify(calls[0]?.input)).toContain(
            "`mac-2` (id `bbbbbb`)"
        );
    });

    it("only logs when the board refuses the report or the run file is missing", async () => {
        const { api, calls } = fakeApi(true);
        const lines: string[] = [];
        await reportLeftovers(
            [
                { runId: "run8", run: leftoverRun },
                { runId: "run9", run: null },
            ],
            {
                api,
                runner: { name: "mac", id: "abcdef12" },
                log: (line) => lines.push(line),
            }
        );
        expect(calls).toHaveLength(1);
        expect(lines.join("\n")).toContain("o board não recebeu o aviso");
        expect(lines.join("\n")).toContain("run9");
    });
});

describe("redactHome", () => {
    it("replaces the user folder with ~", () => {
        expect(
            redactHome(
                "fatal: 'feat/x' is already used by worktree at '/Users/ana/.agent-board-runner/worktrees/run1'",
                "/Users/ana"
            )
        ).toBe(
            "fatal: 'feat/x' is already used by worktree at '~/.agent-board-runner/worktrees/run1'"
        );
    });
});
