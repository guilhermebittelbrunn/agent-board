import { describe, expect, it } from "vitest";
import { removeWorktreePlan, repositoryUrl, worktreePlan } from "../src/git.ts";

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
