import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOCAL_SUFFIX = /\.local$/;
const NAME_UNSAFE = /[^A-Za-z0-9._-]/g;
const MAX_NAME_LENGTH = 40;

export type RunnerConfig = {
    apiUrl: string;
    runnerId: string;
    name: string;
    token: string;
    /** ISO date; `start` takes the oldest free runner first. */
    registeredAt: string;
};

export const HOME_ENV = "AGENT_BOARD_RUNNER_HOME";

export function defaultHome(env: NodeJS.ProcessEnv = process.env): string {
    return env[HOME_ENV] || path.join(os.homedir(), ".agent-board-runner");
}

export const runnerPaths = (home: string) => ({
    /** Where a single runner per folder kept its credential; read once and moved to `runners`. */
    legacyConfig: path.join(home, "config.json"),
    credentials: path.join(home, "runners"),
    repos: path.join(home, "repos"),
    worktrees: path.join(home, "worktrees"),
    runs: path.join(home, "runs"),
    logs: path.join(home, "logs"),
});

export async function ensurePrivateDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
}

const RUNNER_SHORT_ID_LENGTH = 6;
const TOKEN_ENDING_LENGTH = 4;

/**
 * The same short id the board shows next to the runner's name (`shortRunnerId` in
 * `@repo/kanban-contract`). This CLI cannot import that package at run time: its modules import
 * each other without the `.ts` extension, which Node does not resolve, and the copy
 * `install-bin` makes carries no `node_modules`.
 */
export const shortRunnerId = (runnerId: string): string =>
    runnerId.slice(0, RUNNER_SHORT_ID_LENGTH);

/** The last characters of the token, which the board shows as "token terminando em". */
export const tokenEnding = (token: string): string =>
    token.slice(-TOKEN_ENDING_LENGTH);

/** `os.hostname()` reduced to what the board accepts as a runner name. */
export function defaultRunnerName(hostname = os.hostname()): string {
    const cleaned = hostname
        .replace(LOCAL_SUFFIX, "")
        .replace(NAME_UNSAFE, "-")
        .slice(0, MAX_NAME_LENGTH);
    return cleaned === "" ? "runner" : cleaned;
}
