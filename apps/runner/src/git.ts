import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const TRAILING_SLASH = /\/$/;
const REF_LOCKED = /cannot lock ref/;
const FETCH_ATTEMPTS = 3;
const FETCH_RETRY_MS = 500;

export type GitStep = { args: string[]; cwd: string };

export function repositoryUrl(
    repoBase: string,
    owner: string,
    name: string
): string {
    return `${repoBase.replace(TRAILING_SLASH, "")}/${owner}/${name}.git`;
}

/**
 * A branch that is not on the remote yet starts from the base without tracking it, so the
 * agent's first push creates the card's branch instead of landing on the base.
 */
export function worktreePlan(input: {
    repoDir: string;
    worktreeDir: string;
    branch: string;
    baseBranch: string;
    remoteHasBranch: boolean;
}): GitStep[] {
    const { repoDir, worktreeDir, branch } = input;
    const add = input.remoteHasBranch
        ? ["worktree", "add", "-B", branch, worktreeDir, `origin/${branch}`]
        : [
              "worktree",
              "add",
              "--no-track",
              "-B",
              branch,
              worktreeDir,
              `origin/${input.baseBranch}`,
          ];
    return [
        { args: ["worktree", "prune"], cwd: repoDir },
        { args: add, cwd: repoDir },
    ];
}

export function removeWorktreePlan(
    repoDir: string,
    worktreeDir: string
): GitStep[] {
    return [
        { args: ["worktree", "remove", "--force", worktreeDir], cwd: repoDir },
        { args: ["worktree", "prune"], cwd: repoDir },
    ];
}

export type GitResult = { code: number; stdout: string; stderr: string };

export function runGit(step: GitStep): Promise<GitResult> {
    return new Promise((resolve) => {
        const child = spawn("git", step.args, {
            cwd: step.cwd,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) =>
            resolve({ code: 1, stdout, stderr: error.message })
        );
        child.on("close", (code) =>
            resolve({ code: code ?? 1, stdout, stderr })
        );
    });
}

export async function runGitSteps(steps: GitStep[]): Promise<GitResult> {
    let last: GitResult = { code: 0, stdout: "", stderr: "" };
    for (const step of steps) {
        last = await runGit(step);
        if (last.code !== 0) {
            return last;
        }
    }
    return last;
}

/**
 * Runners of one machine share the clone, and an agent's push from its worktree updates the
 * same remote refs this fetch writes. When the two meet, git refuses with "cannot lock ref"
 * instead of waiting; trying again a moment later succeeds. Any other failure is returned at once.
 */
export async function fetchOrigin(
    repoDir: string,
    run: (step: GitStep) => Promise<GitResult> = runGit,
    wait: (ms: number) => Promise<unknown> = sleep
): Promise<GitResult> {
    let result = await run({
        args: ["fetch", "origin", "--prune"],
        cwd: repoDir,
    });
    for (
        let attempt = 1;
        attempt < FETCH_ATTEMPTS &&
        result.code !== 0 &&
        REF_LOCKED.test(result.stderr);
        attempt += 1
    ) {
        await wait(FETCH_RETRY_MS);
        result = await run({
            args: ["fetch", "origin", "--prune"],
            cwd: repoDir,
        });
    }
    return result;
}
