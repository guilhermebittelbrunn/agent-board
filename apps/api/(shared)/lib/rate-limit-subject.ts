import { parseRunToken } from "./agent-contract/run-token-format";
import { parseRunnerToken } from "./runner/runner-token-format";

const ANONYMOUS_SUBJECT = "anonymous";
const BEARER_PREFIX = "Bearer ";
const JWT_SEGMENT_COUNT = 3;
const SUBJECT_HEX_LENGTH = 32;
const BASE64_BLOCK_LENGTH = 4;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;

function decodeBase64Url(segment: string): string | null {
    try {
        const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
        const padded = base64.padEnd(
            Math.ceil(base64.length / BASE64_BLOCK_LENGTH) *
                BASE64_BLOCK_LENGTH,
            "="
        );
        const bytes = Uint8Array.from(atob(padded), (char) =>
            char.charCodeAt(0)
        );
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

function readJwtSubject(token: string): string | null {
    const segments = token.split(".");
    if (segments.length !== JWT_SEGMENT_COUNT) {
        return null;
    }

    const payload = decodeBase64Url(segments[1]);
    if (payload === null) {
        return null;
    }

    try {
        const claims: unknown = JSON.parse(payload);
        if (claims && typeof claims === "object" && "sub" in claims) {
            const { sub } = claims;
            return typeof sub === "string" && sub !== "" ? sub : null;
        }
        return null;
    } catch {
        return null;
    }
}

function machineSubject(bearer: string): string | null {
    const runToken = parseRunToken(bearer);
    if (runToken) {
        return `run:${runToken.runId}`;
    }
    const runnerToken = parseRunnerToken(bearer);
    return runnerToken ? `runner:${runnerToken.runnerId}` : null;
}

function readBearerToken(request: Request): string {
    const header = request.headers.get("authorization");
    return header?.startsWith(BEARER_PREFIX)
        ? header.slice(BEARER_PREFIX.length).trim()
        : "";
}

/**
 * Picks the rate limit bucket of the caller. The token is decoded, NOT verified: a forged
 * `sub` only buys a fresh bucket for a request the guard then refuses, so the result must
 * never be used to authorize anything. Hashed because it leaves for the rate limit provider.
 *
 * An agent's run token gets a bucket per run: cloud sessions of different people leave
 * from the same addresses and would otherwise share one anonymous bucket. A local runner's
 * token gets a bucket per runner, for the same reason.
 */
export async function rateLimitSubject(request: Request): Promise<string> {
    const bearer = readBearerToken(request);
    const subject = machineSubject(bearer) ?? readJwtSubject(bearer);
    if (!subject) {
        return ANONYMOUS_SUBJECT;
    }

    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(subject)
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, "0")
    )
        .join("")
        .slice(0, SUBJECT_HEX_LENGTH);
}
