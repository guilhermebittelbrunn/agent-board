import { linkSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensurePrivateDir, runnerPaths } from "./config.ts";

const PRIVATE_FILE_MODE = 0o600;

export type RunnerLock =
    | { ok: true; release: () => void }
    | { ok: false; pid: number };

export function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}

const lockPath = (home: string, runnerId: string) =>
    path.join(runnerPaths(home).credentials, `${runnerId}.lock`);

/** The pid of a live process other than this one running this runner, if any. */
export function runnerHolder(home: string, runnerId: string): number | null {
    try {
        const pid = Number.parseInt(
            readFileSync(lockPath(home, runnerId), "utf8"),
            10
        );
        return Number.isInteger(pid) &&
            pid > 0 &&
            pid !== process.pid &&
            isAlive(pid)
            ? pid
            : null;
    } catch {
        return null;
    }
}

/**
 * Creates the lock file already holding this pid, or fails when it exists. `link` is atomic,
 * so two terminals started at the same moment cannot both take it, and the file is never seen
 * empty by another process reading the holder.
 */
function createLockFile(file: string): boolean {
    const draft = `${file}.${process.pid}`;
    writeFileSync(draft, String(process.pid), { mode: PRIVATE_FILE_MODE });
    try {
        linkSync(draft, file);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        return false;
    } finally {
        rmSync(draft, { force: true });
    }
}

/**
 * One process per runner. Two terminals claiming with the same token would both act as the
 * same runner: the board keeps one current run per runner, so the other's run is orphaned.
 */
export async function acquireRunnerLock(
    home: string,
    runnerId: string
): Promise<RunnerLock> {
    await ensurePrivateDir(runnerPaths(home).credentials);
    const file = lockPath(home, runnerId);
    while (!createLockFile(file)) {
        const holder = runnerHolder(home, runnerId);
        if (holder !== null) {
            return { ok: false, pid: holder };
        }
        rmSync(file, { force: true });
    }
    const release = () => {
        if (runnerHolder(home, runnerId) === null) {
            rmSync(file, { force: true });
        }
    };
    process.once("exit", release);
    return { ok: true, release };
}
