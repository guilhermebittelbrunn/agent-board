import {
    readdir,
    readFile,
    realpath,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import path from "node:path";
import { runGit } from "./git.ts";
import type { RunnerIdentity } from "./report.ts";

const PRIVATE_FILE_MODE = 0o600;
const RUNNER_PID_FILE = "runner.pid";
const AGENT_PID_FILE = "agent.pid";
const RUN_FILE = "run.json";
/** A run folder this young without a pid file may belong to a runner still writing it. */
const MISSING_PID_GRACE_MS = 60_000;
const WORKTREE_LINE = /^worktree (.+)$/;

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}

async function readPid(file: string): Promise<number | null> {
    try {
        const pid = Number.parseInt(await readFile(file, "utf8"), 10);
        return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
        return null;
    }
}

export function writeRunnerPid(runDir: string): Promise<void> {
    return writeFile(path.join(runDir, RUNNER_PID_FILE), String(process.pid), {
        mode: PRIVATE_FILE_MODE,
    });
}

export function writeAgentPid(runDir: string, pid: number): Promise<void> {
    return writeFile(path.join(runDir, AGENT_PID_FILE), String(pid), {
        mode: PRIVATE_FILE_MODE,
    });
}

/** What the sweep needs to close the stage of a run whose runner died before it could. */
export type LeftoverRun = {
    cardId: string;
    stageKey: string;
    command: string;
    slug: string;
    runToken: string;
    /** The runner that took the run; the one cleaning up may be another runner of the folder. */
    runner?: RunnerIdentity;
};

export type Leftover = { runId: string; run: LeftoverRun | null };

function isRunnerIdentity(value: unknown): value is RunnerIdentity {
    const runner = value as Partial<RunnerIdentity> | null;
    return (
        typeof runner === "object" &&
        runner !== null &&
        typeof runner.name === "string" &&
        typeof runner.id === "string"
    );
}

export function writeRunFile(runDir: string, run: LeftoverRun): Promise<void> {
    return writeFile(path.join(runDir, RUN_FILE), JSON.stringify(run), {
        mode: PRIVATE_FILE_MODE,
    });
}

async function readRunFile(runDir: string): Promise<LeftoverRun | null> {
    try {
        const parsed = JSON.parse(
            await readFile(path.join(runDir, RUN_FILE), "utf8")
        ) as Partial<LeftoverRun>;
        const fields = [
            parsed.cardId,
            parsed.stageKey,
            parsed.command,
            parsed.slug,
            parsed.runToken,
        ];
        if (!fields.every((field) => typeof field === "string")) {
            return null;
        }
        const { runner, ...run } = parsed as LeftoverRun;
        return isRunnerIdentity(runner) ? { ...run, runner } : run;
    } catch {
        return null;
    }
}

/**
 * A run belongs to a live runner when the process that wrote its pid file still exists and is
 * not this one: this process runs one job at a time, so any older run of its own is a leftover.
 * Several runners may share one home, and their runs are left alone.
 */
async function ownedByLiveRunner(runDir: string): Promise<boolean> {
    const pid = await readPid(path.join(runDir, RUNNER_PID_FILE));
    if (pid === null) {
        const info = await stat(runDir).catch(() => null);
        return (
            info !== null && Date.now() - info.mtimeMs < MISSING_PID_GRACE_MS
        );
    }
    return pid !== process.pid && isAlive(pid);
}

/**
 * Cleans what a runner killed mid-run left behind (second Ctrl+C, `kill -9`, power loss): the
 * agent's process group, which still holds the run token, the `mcp.json` with that token and
 * the run's worktree folder. Returns what it cleaned, with what is needed to tell the board.
 */
export async function sweepLeftoverRuns(paths: {
    runs: string;
    worktrees: string;
}): Promise<Leftover[]> {
    const runIds = await readdir(paths.runs).catch(() => [] as string[]);
    const cleaned: Leftover[] = [];
    for (const runId of runIds) {
        const runDir = path.join(paths.runs, runId);
        if (await ownedByLiveRunner(runDir)) {
            continue;
        }
        const agentPid = await readPid(path.join(runDir, AGENT_PID_FILE));
        if (agentPid !== null && isAlive(agentPid)) {
            try {
                process.kill(-agentPid, "SIGKILL");
            } catch {
                // The group is already gone.
            }
        }
        const run = await readRunFile(runDir);
        await rm(path.join(paths.worktrees, runId), {
            recursive: true,
            force: true,
        });
        await rm(runDir, { recursive: true, force: true });
        cleaned.push({ runId, run });
    }
    return cleaned;
}

/** Git prints real paths; on macOS the runner's home may sit behind a link such as `/var`. */
const canonical = (dir: string) => realpath(dir).catch(() => dir);

function worktreesOnBranch(porcelain: string, branch: string): string[] {
    const found: string[] = [];
    for (const block of porcelain.split("\n\n")) {
        const lines = block.split("\n");
        const location = lines[0]?.match(WORKTREE_LINE)?.[1];
        if (location && lines.includes(`branch refs/heads/${branch}`)) {
            found.push(location);
        }
    }
    return found;
}

/**
 * Git refuses to check a branch out in two worktrees. A worktree of this runner's home still on
 * the card's branch (kept with `--keep-worktrees`, or left by a runner that died) is removed
 * before the new one is added, unless a live runner is using it.
 */
export async function releaseBranchWorktrees(input: {
    repoDir: string;
    worktreesDir: string;
    runsDir: string;
    branch: string;
}): Promise<void> {
    const listed = await runGit({
        args: ["worktree", "list", "--porcelain"],
        cwd: input.repoDir,
    });
    if (listed.code !== 0) {
        return;
    }
    const ownFolder = await canonical(input.worktreesDir);
    for (const location of worktreesOnBranch(listed.stdout, input.branch)) {
        const runId = path.basename(location);
        if (
            (await canonical(path.dirname(location))) !== ownFolder ||
            (await ownedByLiveRunner(path.join(input.runsDir, runId)))
        ) {
            continue;
        }
        await runGit({
            args: ["worktree", "remove", "--force", location],
            cwd: input.repoDir,
        });
        await rm(location, { recursive: true, force: true });
    }
    await runGit({ args: ["worktree", "prune"], cwd: input.repoDir });
}
