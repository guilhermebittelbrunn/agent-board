import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { withRepoLock } from "../src/repo-lock.ts";

const SHORT_TIMEOUT_MS = 300;
const WORK_MS = 50;
let root = "";

afterEach(async () => {
    if (root !== "") {
        await rm(root, { recursive: true, force: true });
    }
});

function exitedPid(): Promise<number> {
    const child = spawn(process.execPath, ["-e", ""]);
    return new Promise((resolve) =>
        child.on("exit", () => resolve(child.pid ?? 0))
    );
}

describe("withRepoLock", () => {
    it("runs the work of two runners on one repository one after the other", async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "runner-repolock-"));
        const lockDir = path.join(root, "owner", "repo.lock");
        const events: string[] = [];
        const work = (name: string) => async () => {
            events.push(`${name}:start`);
            await sleep(WORK_MS);
            events.push(`${name}:end`);
        };

        await Promise.all([
            withRepoLock(lockDir, work("a")),
            withRepoLock(lockDir, work("b")),
        ]);

        const [first, , second] = events.map((event) => event.split(":")[0]);
        expect(events).toEqual([
            `${first}:start`,
            `${first}:end`,
            `${second}:start`,
            `${second}:end`,
        ]);
        expect(first).not.toBe(second);
    });

    it("takes over the lock of a runner that died holding it", async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "runner-repolock-"));
        const lockDir = path.join(root, "repo.lock");
        await mkdir(lockDir);
        await writeFile(path.join(lockDir, "pid"), String(await exitedPid()));

        expect(await withRepoLock(lockDir, () => Promise.resolve("ok"))).toBe(
            "ok"
        );
    });

    it("gives up while a live runner holds it", async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "runner-repolock-"));
        const lockDir = path.join(root, "repo.lock");
        await mkdir(lockDir);
        await writeFile(path.join(lockDir, "pid"), String(process.ppid));

        await expect(
            withRepoLock(lockDir, () => Promise.resolve("ok"), SHORT_TIMEOUT_MS)
        ).rejects.toThrow("outro runner");
    });
});
