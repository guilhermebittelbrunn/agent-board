import { spawn, spawnSync } from "node:child_process";
import {
    cp,
    mkdir,
    mkdtemp,
    readdir,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import { parseArgs } from "../src/cli.ts";

const EXIT_USAGE = 2;
const HTTP_UNAUTHORIZED = 401;
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

describe("start against a board that refuses the runner's token", () => {
    let home: string;
    let server: Server;
    let apiUrl: string;
    let refusal = "RUNNER_REVOKED";

    const saved = (runnerId: string, registeredAt: string) => ({
        apiUrl,
        runnerId,
        name: runnerId,
        token: `kbl_${runnerId}_secret`,
        registeredAt,
    });

    beforeAll(async () => {
        server = createServer((_request, response) => {
            response.writeHead(HTTP_UNAUTHORIZED, {
                "content-type": "application/json",
            });
            response.end(JSON.stringify({ error: { code: refusal } }));
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve)
        );
        apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    beforeEach(async () => {
        home = await mkdtemp(path.join(os.tmpdir(), "runner-revoked-"));
        await mkdir(path.join(home, "runners"), { recursive: true });
        for (const credential of [
            saved("runnerA", "2026-01-01T00:00:00.000Z"),
            saved("runnerB", "2026-01-02T00:00:00.000Z"),
        ]) {
            await writeFile(
                path.join(home, "runners", `${credential.runnerId}.json`),
                JSON.stringify(credential)
            );
        }
    });

    afterEach(async () => {
        await rm(home, { recursive: true, force: true });
    });

    const start = () =>
        new Promise<{ code: number | null; stdout: string }>((resolve) => {
            const child = spawn(
                process.execPath,
                [
                    "--experimental-strip-types",
                    "--disable-warning=ExperimentalWarning",
                    path.join(SOURCE, "cli.ts"),
                    "start",
                    "--home",
                    home,
                ],
                { env: { PATH: process.env.PATH ?? "" } }
            );
            let stdout = "";
            child.stdout.on("data", (chunk: Buffer) => {
                stdout += chunk.toString();
            });
            child.on("close", (code) => resolve({ code, stdout }));
        });

    it("removes the credential of a revoked runner and keeps the others", async () => {
        refusal = "RUNNER_REVOKED";
        const result = await start();

        expect(result.code).toBe(1);
        expect(result.stdout).toContain("runner revogado no board");
        expect(await readdir(path.join(home, "runners"))).toEqual([
            "runnerB.json",
        ]);
    });

    it("keeps the credential when the token is only unknown to this API", async () => {
        refusal = "RUNNER_TOKEN_INVALID";
        const result = await start();

        expect(result.code).toBe(1);
        expect(result.stdout).toContain("RUNNER_TOKEN_INVALID");
        expect((await readdir(path.join(home, "runners"))).sort()).toEqual([
            "runnerA.json",
            "runnerB.json",
        ]);
    });
});
