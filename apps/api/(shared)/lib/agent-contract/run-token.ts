import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { runRepository } from "@/(shared)/repositories/run.repository";
import { RUN_TOKEN_PREFIX } from "./run-token-format";

const SECRET_BYTES = 32;

export function hashRunSecret(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** The token leaves the API once, here; only the hash of its secret is stored. */
export function mintRunToken(runId: string): {
    token: string;
    tokenHash: string;
} {
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    return {
        token: `${RUN_TOKEN_PREFIX}${runId}_${secret}`,
        tokenHash: hashRunSecret(secret),
    };
}

export function matchesRunToken(
    secret: string,
    tokenHash: string | null
): boolean {
    if (tokenHash === null) {
        return false;
    }
    const expected = Buffer.from(tokenHash, "utf8");
    const given = Buffer.from(hashRunSecret(secret), "utf8");
    return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A token without an expiry was never issued properly, so it counts as expired. */
export function isRunTokenExpired(
    expiresAt: string | null,
    now: Date
): boolean {
    return expiresAt === null || now.getTime() >= Date.parse(expiresAt);
}

export type IssueRunTokenResult =
    | { ok: true; token: string; expiresAt: string }
    | { ok: false; code: "AGENT_RUN_CLOSED" };

/**
 * Gives a running run a fresh token that expires with the run's deadline. Issuing again
 * replaces the stored hash, so the previous token stops working.
 */
export async function issueRunToken(
    runId: string
): Promise<IssueRunTokenResult> {
    const { token, tokenHash } = mintRunToken(runId);
    const stored = await runRepository.setToken(runId, tokenHash);
    return stored.ok
        ? { ok: true, token, expiresAt: stored.expiresAt }
        : { ok: false, code: "AGENT_RUN_CLOSED" };
}
