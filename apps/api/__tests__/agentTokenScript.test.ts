import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {},
}));

const { hashRunSecret } = await import(
    "@/(shared)/lib/agent-contract/run-token"
);

import { parseRunToken } from "@/(shared)/lib/agent-contract/run-token-format";
import {
    hashRunSecret as scriptHash,
    mintRunToken as scriptMint,
} from "../scripts/agentTokenMint.mjs";

const scriptsDir = join(__dirname, "../scripts");
const SECRET_LENGTH = 43;

describe("agentTokenMint.mjs", () => {
    it("mints a token the API parses and hashes it the same way", () => {
        const { token, tokenHash } = scriptMint("r9Xa");
        const parsed = parseRunToken(token);

        expect(parsed?.runId).toBe("r9Xa");
        expect(tokenHash).toBe(hashRunSecret(parsed?.secret ?? ""));
        expect(scriptHash("x".repeat(SECRET_LENGTH))).toBe(
            hashRunSecret("x".repeat(SECRET_LENGTH))
        );
    });
});

describe("agent-token.mjs", () => {
    // Only the variables under test: nothing from the developer's shell reaches the script.
    const run = (env: Record<string, string>) =>
        spawnSync(
            process.execPath,
            [join(scriptsDir, "agent-token.mjs"), "board", "slug"],
            {
                env: {
                    PATH: process.env.PATH ?? "",
                    ...env,
                } as unknown as NodeJS.ProcessEnv,
                encoding: "utf8",
            }
        );

    it("refuses to run without both emulators", () => {
        const result = run({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-x" });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Refusing to seed");
        expect(result.stdout).not.toContain("kbr_");
    });

    it("refuses a project that is not a demo one, even with the emulators set", () => {
        const result = run({
            FIRESTORE_EMULATOR_HOST: "127.0.0.1:1",
            FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:1",
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: "agent-board-prod",
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
            'the target project is "agent-board-prod"'
        );
        expect(result.stdout).not.toContain("kbr_");
    });
});
