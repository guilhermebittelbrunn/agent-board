import { spawnSync } from "node:child_process";
import {
    cp,
    mkdtemp,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.ts";

const EXIT_USAGE = 2;
const SOURCE = path.resolve(import.meta.dirname, "../src");

describe("parseArgs and --permission-mode", () => {
    it.each([
        ["--permission-mode", "bypassPermissions"],
        ["--permission-mode=bypassPermissions"],
        ["--permission-mode=acceptEdits"],
    ])("refuses %s as a usage error", (...flag) => {
        const parsed = parseArgs(["start", ...flag], {}, "/w");
        expect(parsed.command).toBe("error");
        expect(parsed).toMatchObject({
            message: expect.stringContaining("--permission-mode não existe"),
        });
    });
});

describe("the CLI run by node from a path with spaces and accents", () => {
    let root: string;
    let cli: string;

    beforeAll(async () => {
        root = await mkdtemp(
            path.join(await realpath(os.tmpdir()), "runner cli ação-")
        );
        await cp(SOURCE, path.join(root, "src"), { recursive: true });
        await writeFile(
            path.join(root, "package.json"),
            JSON.stringify({ type: "module" })
        );
        cli = path.join(root, "src", "cli.ts");
    });

    afterAll(async () => {
        await rm(root, { recursive: true, force: true });
    });

    const run = (...args: string[]) =>
        spawnSync(
            process.execPath,
            [
                "--experimental-strip-types",
                "--disable-warning=ExperimentalWarning",
                cli,
                ...args,
            ],
            { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } }
        );

    it("exits with the usage code for --permission-mode=", () => {
        const result = run("start", "--permission-mode=bypassPermissions");
        expect(result.status).toBe(EXIT_USAGE);
        expect(result.stderr).toContain("--permission-mode não existe");
    });

    it("exits with 1 when the API refuses or cannot be reached", () => {
        const result = run(
            "register",
            "KQ7M-4XPD",
            "--api",
            "http://127.0.0.1:1",
            "--home",
            path.join(root, "home")
        );
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("registro recusado");
    });

    it("prints the usage for an unknown command", () => {
        const result = run("deploy");
        expect(result.status).toBe(EXIT_USAGE);
        expect(result.stderr).toContain("runner start");
    });

    it("runs when reached through a symbolic link", async () => {
        const link = `${root}-link`;
        await symlink(root, link);
        try {
            const result = spawnSync(
                process.execPath,
                [
                    "--experimental-strip-types",
                    "--disable-warning=ExperimentalWarning",
                    path.join(link, "src", "cli.ts"),
                    "deploy",
                ],
                { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } }
            );
            expect(result.status).toBe(EXIT_USAGE);
        } finally {
            await rm(link, { force: true });
        }
    });
});
