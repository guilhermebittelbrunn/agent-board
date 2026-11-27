import { stat } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { RunnerConfig } from "../src/config.ts";
import {
    listCredentials,
    nextRunnerName,
    pickCredential,
    removeCredential,
    saveCredential,
} from "../src/credentials.ts";

const OCTAL = 8;
const MAX_NAME = 40;
let home = "";

afterEach(async () => {
    if (home !== "") {
        await rm(home, { recursive: true, force: true });
    }
});

const credential = (
    runnerId: string,
    registeredAt: string,
    name = "mac"
): RunnerConfig => ({
    apiUrl: "https://board.example",
    runnerId,
    name,
    token: `kbl_${runnerId}_secret`,
    registeredAt,
});

describe("credential store", () => {
    it("keeps every runner registered in the folder, oldest first, readable only by the user", async () => {
        home = await mkdtemp(path.join(os.tmpdir(), "runner-cred-"));
        const file = await saveCredential(
            home,
            credential("bRunner", "2026-11-27T21:00:00.000Z")
        );
        await saveCredential(
            home,
            credential("aRunner", "2026-11-27T22:00:00.000Z")
        );

        const listed = await listCredentials(home);
        expect(listed.map((item) => item.runnerId)).toEqual([
            "bRunner",
            "aRunner",
        ]);
        const mode = (await promisify(stat)(file)).mode.toString(OCTAL);
        expect(mode.endsWith("600")).toBe(true);

        await removeCredential(home, "bRunner");
        expect(
            (await listCredentials(home)).map((item) => item.runnerId)
        ).toEqual(["aRunner"]);
    });

    it("moves the single config.json of an older folder into the store", async () => {
        home = await mkdtemp(path.join(os.tmpdir(), "runner-cred-"));
        await writeFile(
            path.join(home, "config.json"),
            JSON.stringify({
                apiUrl: "https://board.example",
                runnerId: "c704GbOe9oeb",
                name: "mac",
                token: "kbl_c704GbOe9oeb_secret",
            })
        );

        const listed = await listCredentials(home);
        expect(listed).toEqual([
            {
                ...credential("c704GbOe9oeb", ""),
                token: "kbl_c704GbOe9oeb_secret",
            },
        ]);
        expect(await readdir(home)).toEqual(["runners"]);
    });

    it("refuses a runner id that would leave the folder", async () => {
        home = await mkdtemp(path.join(os.tmpdir(), "runner-cred-"));
        await expect(
            saveCredential(home, credential("../evil", "x"))
        ).rejects.toThrow();
    });
});

describe("pickCredential", () => {
    const first = credential("c704GbOe9oeb", "1", "mac");
    const second = credential("1weWj1eeIM1s", "2", "mac-2");
    const all = [first, second];

    it("takes the oldest runner no other terminal is running", () => {
        expect(pickCredential(all, () => false, null)).toEqual({
            ok: true,
            credential: first,
        });
        expect(
            pickCredential(all, (id) => id === first.runnerId, null)
        ).toEqual({
            ok: true,
            credential: second,
        });
    });

    it("says so when every runner is running or none is registered", () => {
        expect(pickCredential(all, () => true, null)).toEqual({
            ok: false,
            reason: "all_busy",
        });
        expect(pickCredential([], () => false, null)).toEqual({
            ok: false,
            reason: "none",
        });
    });

    it("takes the runner asked for by id prefix or name", () => {
        expect(pickCredential(all, () => false, "1weW")).toEqual({
            ok: true,
            credential: second,
        });
        expect(pickCredential(all, () => false, "mac-2")).toEqual({
            ok: true,
            credential: second,
        });
        expect(pickCredential(all, () => false, "zzz")).toEqual({
            ok: false,
            reason: "not_found",
        });
        expect(
            pickCredential(
                [first, credential("c704Xx", "3")],
                () => false,
                "c704"
            )
        ).toEqual({ ok: false, reason: "ambiguous" });
    });
});

describe("nextRunnerName", () => {
    it("numbers the host name when another runner of the machine has it", () => {
        expect(nextRunnerName("mac", [])).toBe("mac");
        expect(nextRunnerName("mac", [{ name: "mac" }])).toBe("mac-2");
        expect(
            nextRunnerName("mac", [{ name: "mac" }, { name: "mac-2" }])
        ).toBe("mac-3");
    });

    it("stays inside the board's name limit", () => {
        const long = "x".repeat(MAX_NAME);
        const name = nextRunnerName(long, [{ name: long }]);
        expect(name.length).toBe(MAX_NAME);
        expect(name.endsWith("-2")).toBe(true);
    });
});
