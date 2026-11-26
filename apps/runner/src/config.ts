import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PRIVATE_FILE_MODE = 0o600;
const LOCAL_SUFFIX = /\.local$/;
const NAME_UNSAFE = /[^A-Za-z0-9._-]/g;
const MAX_NAME_LENGTH = 40;

export type RunnerConfig = {
    apiUrl: string;
    runnerId: string;
    name: string;
    token: string;
};

export const HOME_ENV = "AGENT_BOARD_RUNNER_HOME";

export function defaultHome(env: NodeJS.ProcessEnv = process.env): string {
    return env[HOME_ENV] || path.join(os.homedir(), ".agent-board-runner");
}

export const runnerPaths = (home: string) => ({
    config: path.join(home, "config.json"),
    repos: path.join(home, "repos"),
    worktrees: path.join(home, "worktrees"),
    runs: path.join(home, "runs"),
    logs: path.join(home, "logs"),
});

export async function ensurePrivateDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
}

/** The token is a credential: readable only by this user, never inside a repository. */
export async function writeConfig(
    home: string,
    config: RunnerConfig
): Promise<string> {
    await ensurePrivateDir(home);
    const file = runnerPaths(home).config;
    await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, {
        mode: PRIVATE_FILE_MODE,
    });
    await chmod(file, PRIVATE_FILE_MODE);
    return file;
}

export async function readConfig(home: string): Promise<RunnerConfig | null> {
    try {
        const parsed = JSON.parse(
            await readFile(runnerPaths(home).config, "utf8")
        ) as Partial<RunnerConfig>;
        if (
            typeof parsed.apiUrl === "string" &&
            typeof parsed.runnerId === "string" &&
            typeof parsed.name === "string" &&
            typeof parsed.token === "string"
        ) {
            return parsed as RunnerConfig;
        }
        return null;
    } catch {
        return null;
    }
}

/** `os.hostname()` reduced to what the board accepts as a runner name. */
export function defaultRunnerName(hostname = os.hostname()): string {
    const cleaned = hostname
        .replace(LOCAL_SUFFIX, "")
        .replace(NAME_UNSAFE, "-")
        .slice(0, MAX_NAME_LENGTH);
    return cleaned === "" ? "runner" : cleaned;
}
