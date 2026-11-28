import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const INSTALL = path.resolve(import.meta.dirname, "../scripts/install-bin.mjs");
let root = "";

afterEach(async () => {
    if (root !== "") {
        await rm(root, { recursive: true, force: true });
    }
});

describe("install-bin", () => {
    it("installs a copy of the runner that runs from any folder, outside the checkout", async () => {
        root = await mkdtemp(
            path.join(await realpath(os.tmpdir()), "runner-bin-")
        );
        const binDir = path.join(root, "bin");
        const home = path.join(root, "home");
        const env = { PATH: process.env.PATH ?? "", HOME: root };

        const installed = spawnSync(
            process.execPath,
            [INSTALL, "--dir", binDir, "--home", home],
            { encoding: "utf8", env }
        );
        expect(installed.status).toBe(0);
        expect(existsSync(path.join(home, "app", "src", "cli.ts"))).toBe(true);
        const version = (
            await readFile(path.join(home, "app", "VERSION"), "utf8")
        ).trim();
        expect(version).toContain("instalado em");

        const command = path.join(binDir, "agent-board-runner");
        const reported = spawnSync(command, ["version"], {
            encoding: "utf8",
            env,
            cwd: root,
        });
        expect(reported.status).toBe(0);
        expect(reported.stdout.trim()).toBe(version);

        const listed = spawnSync(command, ["list", "--home", home], {
            encoding: "utf8",
            env,
            cwd: root,
        });
        expect(listed.status).toBe(0);
        expect(listed.stdout).toContain("nenhum runner registrado");

        const again = spawnSync(
            process.execPath,
            [INSTALL, "--dir", binDir, "--home", home],
            { encoding: "utf8", env }
        );
        expect(again.status).toBe(0);
        expect(existsSync(path.join(home, "app.previous"))).toBe(false);
    });
});
