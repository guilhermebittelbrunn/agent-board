import { describe, expect, it, vi } from "vitest";

// run-token.ts also issues tokens through the run repository, which this file never uses.
vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {},
}));

import {
    matchesRunToken,
    mintRunToken,
} from "@/(shared)/lib/agent-contract/run-token";
import { parseRunToken } from "@/(shared)/lib/agent-contract/run-token-format";
import {
    hashRunnerCode,
    mintRunnerCode,
} from "@/(shared)/lib/runner/runner-code";
import { finishMarkdown } from "@/(shared)/lib/runner/runner-finish";
import { mintRunnerToken } from "@/(shared)/lib/runner/runner-token";
import { parseRunnerToken } from "@/(shared)/lib/runner/runner-token-format";

const SECRET_LENGTH = 43;
const DRAWS = 50;
const CROCKFORD_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("runner token", () => {
    it("mints kbl_<runnerId>_<secret> and keeps only the hash", () => {
        const minted = mintRunnerToken("runnerA");
        const parsed = parseRunnerToken(minted.token);

        expect(parsed?.runnerId).toBe("runnerA");
        expect(minted.tokenHash).not.toContain(parsed?.secret ?? "?");
        expect(matchesRunToken(parsed?.secret ?? "", minted.tokenHash)).toBe(
            true
        );
        expect(minted.token.endsWith(minted.tokenLast4)).toBe(true);
    });

    it("refuses a different secret", () => {
        const minted = mintRunnerToken("runnerA");
        expect(
            matchesRunToken("A".repeat(SECRET_LENGTH), minted.tokenHash)
        ).toBe(false);
    });

    it("never takes a run token for a runner token, nor the other way round", () => {
        const runToken = mintRunToken("run1").token;
        const runnerToken = mintRunnerToken("runnerA").token;

        expect(parseRunnerToken(runToken)).toBeNull();
        expect(parseRunToken(runnerToken)).toBeNull();
    });
});

describe("runner code", () => {
    it("draws eight characters of the Crockford alphabet", () => {
        for (let draw = 0; draw < DRAWS; draw += 1) {
            expect(mintRunnerCode()).toMatch(CROCKFORD_CODE);
        }
    });

    it("stores the code under a hash that does not contain it", () => {
        const hash = hashRunnerCode("KQ7M4XPD");
        expect(hash).toMatch(SHA256_HEX);
        expect(hash).not.toContain("KQ7M4XPD");
    });
});

describe("finishMarkdown", () => {
    it("writes duration, turns, the exit and the local session", () => {
        const markdown = finishMarkdown(
            { command: "/analyze" },
            { id: "c704GbOe9oeb", name: "macbook" },
            {
                turns: 84,
                durationMs: 720_000,
                exit: "turn_limit",
                sessionId: "0b6f1c2e",
            }
        );
        expect(markdown).toContain(
            "Runner `macbook` (id `c704Gb`): `/analyze` terminou em 12 min · 84 turnos."
        );
        expect(markdown).toContain("limite de turnos");
        expect(markdown).toContain("Sessão local: `0b6f1c2e`");
    });

    it("adds no exit line when the agent exited on its own", () => {
        const markdown = finishMarkdown(
            { command: "/develop" },
            { id: "r1", name: "m" },
            { turns: 1, durationMs: 4000, exit: "exited" }
        );
        expect(markdown).toBe(
            "Runner `m` (id `r1`): `/develop` terminou em 4 s · 1 turno."
        );
    });
});
