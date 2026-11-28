import { describe, expect, it } from "vitest";
import {
    fetchOrigin,
    type GitResult,
    removeWorktreePlan,
    repositoryUrl,
    worktreePlan,
} from "../src/git.ts";

const base = {
    repoDir: "/home/r/repos/o/n",
    worktreeDir: "/home/r/worktrees/run1",
    branch: "feat/search-cards",
    baseBranch: "main",
};

describe("worktreePlan", () => {
    it("checks out the card's branch from the remote when it exists", () => {
        expect(worktreePlan({ ...base, remoteHasBranch: true })).toEqual([
            { args: ["worktree", "prune"], cwd: base.repoDir },
            {
                args: [
                    "worktree",
                    "add",
                    "-B",
                    "feat/search-cards",
                    base.worktreeDir,
                    "origin/feat/search-cards",
                ],
                cwd: base.repoDir,
            },
        ]);
    });

    it("starts a new branch from the base without tracking it", () => {
        const [, add] = worktreePlan({ ...base, remoteHasBranch: false });
        expect(add.args).toEqual([
            "worktree",
            "add",
            "--no-track",
            "-B",
            "feat/search-cards",
            base.worktreeDir,
            "origin/main",
        ]);
    });

    it("removes the worktree and prunes", () => {
        const plan = removeWorktreePlan(base.repoDir, base.worktreeDir);
        expect(plan.map((step) => step.args.slice(0, 2))).toEqual([
            ["worktree", "remove"],
            ["worktree", "prune"],
        ]);
        expect(plan[0].args.at(-1)).toBe(base.worktreeDir);
    });

    it("builds the clone url from the base", () => {
        expect(repositoryUrl("file:///tmp/repos/", "o", "n")).toBe(
            "file:///tmp/repos/o/n.git"
        );
        expect(repositoryUrl("https://github.com", "o", "n")).toBe(
            "https://github.com/o/n.git"
        );
    });
});

describe("fetchOrigin", () => {
    const ATTEMPTS = 3;
    const locked: GitResult = {
        code: 1,
        stdout: "",
        stderr: "error: cannot lock ref 'refs/remotes/origin/feat/a': is at 1 but expected 2\n",
    };
    const ok: GitResult = { code: 0, stdout: "", stderr: "" };
    const noWait = () => Promise.resolve();

    function scripted(results: GitResult[]) {
        const calls: string[][] = [];
        const run = (step: { args: string[] }) => {
            calls.push(step.args);
            return Promise.resolve(results[calls.length - 1] ?? ok);
        };
        return { run, calls };
    }

    it("tries again when another runner's push holds a remote ref", async () => {
        const { run, calls } = scripted([locked, ok]);
        expect(await fetchOrigin("/repo", run, noWait)).toEqual(ok);
        expect(calls).toEqual([
            ["fetch", "origin", "--prune"],
            ["fetch", "origin", "--prune"],
        ]);
    });

    it("gives up after three locked attempts", async () => {
        const { run, calls } = scripted([locked, locked, locked, ok]);
        expect((await fetchOrigin("/repo", run, noWait)).code).toBe(1);
        expect(calls).toHaveLength(ATTEMPTS);
    });

    it("returns any other failure at once", async () => {
        const unreachable: GitResult = {
            code: 128,
            stdout: "",
            stderr: "fatal: unable to access 'https://github.com/o/n.git/'\n",
        };
        const { run, calls } = scripted([unreachable, ok]);
        expect(await fetchOrigin("/repo", run, noWait)).toEqual(unreachable);
        expect(calls).toHaveLength(1);
    });
});
