#!/usr/bin/env node
/**
 * Creates `<dir>/agent-board-demo/sample-app.git`, a bare repository with one commit on
 * `main`, so the runner can clone and push with `--repo-base file://<dir>` and nothing
 * leaves the machine. Owner and name match the sample repository of the emulator.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const target = process.argv[2];
if (!target) {
    process.stderr.write("uso: node fixture-repo.mjs <dir>\n");
    process.exit(2);
}

const BOARD_YML = `version: 1
name: sample-app
baseBranch: main
stages:
  - key: analyze
    column: Análise
    command: /analyze
  - key: develop
    column: Desenvolvimento
    command: /develop
`;

const bare = path.resolve(target, "agent-board-demo", "sample-app.git");
mkdirSync(path.dirname(bare), { recursive: true });
execFileSync("git", ["init", "--bare", "--initial-branch=main", bare]);

const work = mkdtempSync(path.join(os.tmpdir(), "runner-fixture-"));
const git = (...args) => execFileSync("git", args, { cwd: work });
git("init", "--initial-branch=main");
writeFileSync(path.join(work, "README.md"), "# sample-app\n");
mkdirSync(path.join(work, ".kanban"));
writeFileSync(path.join(work, ".kanban", "board.yml"), BOARD_YML);
git("add", ".");
git(
    "-c",
    "user.name=runner-fixture",
    "-c",
    "user.email=runner-fixture@localhost",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "chore: sample app"
);
git("remote", "add", "origin", `file://${bare}`);
git("push", "origin", "main");
rmSync(work, { recursive: true, force: true });

process.stdout.write(`${bare}\n`);
