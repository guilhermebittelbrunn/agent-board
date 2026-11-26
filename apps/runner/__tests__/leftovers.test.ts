import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sweepLeftoverRuns } from "../src/leftovers.ts";
import { redactHome } from "../src/report.ts";

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
        await addRun("run1", {
            "runner.pid": String(await exitedPid()),
            "agent.pid": String(agent.pid),
            "mcp.json": "{}",
        });

        expect(await sweepLeftoverRuns(paths)).toEqual(["run1"]);

        await new Promise((resolve) => agent.on("exit", resolve));
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

        expect(await sweepLeftoverRuns(paths)).toEqual(["run3"]);
    });

    it("waits before removing a fresh run folder without a pid file", async () => {
        const { paths, addRun } = await layout();
        const fresh = await addRun("run4", {});
        const stale = await addRun("run5", {});
        const past = new Date(Date.now() - OLD_MS);
        await utimes(stale, past, past);

        expect(await sweepLeftoverRuns(paths)).toEqual(["run5"]);
        expect(existsSync(fresh)).toBe(true);
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
