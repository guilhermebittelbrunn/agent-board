import { spawn } from "node:child_process";

const TRAILING_SLASH = /\/$/;

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
