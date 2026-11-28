import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { isAlive } from "./lock.ts";

const PID_FILE = "pid";
const RETRY_MS = 250;
const DEFAULT_TIMEOUT_MS = 300_000;
const MS_PER_SECOND = 1000;

async function holderIsGone(lockDir: string): Promise<boolean> {
    const raw = await readFile(path.join(lockDir, PID_FILE), "utf8").catch(
        () => null
    );
    if (raw === null) {
        return false;
    }
    const pid = Number.parseInt(raw, 10);
    return !(Number.isInteger(pid) && pid > 0 && isAlive(pid));
}

/**
 * Runners of one machine share the clone of each repository. Git takes its own locks while it
 * fetches or adds a worktree and fails instead of waiting, and two first clones into the same
 * folder collide, so these steps run one runner at a time. `mkdir` either creates the folder
 * or fails, which makes it the lock; a lock whose process died is taken over.
 */
export async function withRepoLock<T>(
    lockDir: string,
    work: () => Promise<T>,
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
    await mkdir(path.dirname(lockDir), { recursive: true, mode: 0o700 });
    const giveUpAt = Date.now() + timeoutMs;
    for (;;) {
        try {
            await mkdir(lockDir, { mode: 0o700 });
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
            if (await holderIsGone(lockDir)) {
                await rm(lockDir, { recursive: true, force: true });
                continue;
            }
            if (Date.now() > giveUpAt) {
                throw new Error(
                    `outro runner está usando ${path.basename(lockDir, ".lock")} há mais de ${Math.round(timeoutMs / MS_PER_SECOND)} s`
                );
            }
            await sleep(RETRY_MS);
        }
    }
    try {
        // Written beside the lock and renamed in, so a runner checking the holder never reads
        // a half-written (empty) pid and takes the lock as abandoned.
        const pidDraft = `${lockDir}.${process.pid}.pid`;
        await writeFile(pidDraft, String(process.pid));
        await rename(pidDraft, path.join(lockDir, PID_FILE));
        return await work();
    } finally {
        await rm(lockDir, { recursive: true, force: true });
    }
}
