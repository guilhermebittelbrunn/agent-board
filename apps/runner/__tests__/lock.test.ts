import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { acquireRunnerLock, runnerHolder } from "../src/lock.ts";

const CONTENDERS = 6;
const LOCK_MODULE = pathToFileURL(
    path.resolve(import.meta.dirname, "../src/lock.ts")
).href;
const CONTENDER_SCRIPT = `
const [lockModule, home] = process.argv.slice(1);
const { acquireRunnerLock } = await import(lockModule);
process.stdout.write("ready\\n");
process.stdin.once("data", async () => {
    const lock = await acquireRunnerLock(home, "runnerA");
    process.stdout.write(JSON.stringify(lock.ok ? { ok: true } : lock) + "\\n");
});
`;
let home = "";
const children: ChildProcess[] = [];

afterEach(async () => {
    for (const child of children.splice(0)) {
        child.kill("SIGKILL");
    }
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

    it("lets only one of several processes started together take the same runner", async () => {
        home = await mkdtemp(path.join(os.tmpdir(), "runner-lock-"));
        const contenders = Array.from({ length: CONTENDERS }, () => {
            const child = spawn(
                process.execPath,
                [
                    "--experimental-strip-types",
                    "--disable-warning=ExperimentalWarning",
                    "--input-type=module",
                    "-e",
                    CONTENDER_SCRIPT,
                    LOCK_MODULE,
                    home,
                ],
                { stdio: ["pipe", "pipe", "inherit"] }
            );
            children.push(child);
            const lines = createInterface({ input: child.stdout });
            const next = () =>
                new Promise<string>((resolve) => lines.once("line", resolve));
            return { child, next };
        });

        await Promise.all(contenders.map(({ next }) => next()));
        const answers = contenders.map(({ next }) => next());
        for (const { child } of contenders) {
            child.stdin.write("go\n");
        }
        const results = (await Promise.all(answers)).map(
            (line) => JSON.parse(line) as { ok: boolean; pid?: number }
        );

        const winnerIndex = results.findIndex((result) => result.ok);
        const winnerPid = contenders[winnerIndex]?.child.pid;
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(
            results.filter((result) => !result.ok).map((result) => result.pid)
        ).toEqual(new Array(CONTENDERS - 1).fill(winnerPid));
        expect(runnerHolder(home, "runnerA")).toBe(winnerPid);
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
