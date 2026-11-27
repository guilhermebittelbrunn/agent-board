import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireRunnerLock, runnerHolder } from "../src/lock.ts";

let home = "";

afterEach(async () => {
    if (home !== "") {
        await rm(home, { recursive: true, force: true });
    }
});

function exitedPid(): Promise<number> {
    const child = spawn(process.execPath, ["-e", ""]);
    return new Promise((resolve) =>
        child.on("exit", () => resolve(child.pid ?? 0))
    );
}

async function homeWithLock(runnerId: string, pid: number) {
    home = await mkdtemp(path.join(os.tmpdir(), "runner-lock-"));
    await mkdir(path.join(home, "runners"), { recursive: true });
    const file = path.join(home, "runners", `${runnerId}.lock`);
    await writeFile(file, String(pid));
    return file;
}

describe("runner lock", () => {
    it("refuses a runner another live process is running, and only that runner", async () => {
        await homeWithLock("runnerA", process.ppid);

        expect(runnerHolder(home, "runnerA")).toBe(process.ppid);
        expect(await acquireRunnerLock(home, "runnerA")).toEqual({
            ok: false,
            pid: process.ppid,
        });
        const other = await acquireRunnerLock(home, "runnerB");
        expect(other.ok).toBe(true);
        if (other.ok) {
            other.release();
        }
    });

    it("takes over the lock a dead process left and gives it back on release", async () => {
        const file = await homeWithLock("runnerA", await exitedPid());

        const lock = await acquireRunnerLock(home, "runnerA");
        expect(lock.ok).toBe(true);
        expect(await readFile(file, "utf8")).toBe(String(process.pid));
        expect(runnerHolder(home, "runnerA")).toBeNull();

        if (lock.ok) {
            lock.release();
        }
        await expect(readFile(file, "utf8")).rejects.toThrow();
    });
});
