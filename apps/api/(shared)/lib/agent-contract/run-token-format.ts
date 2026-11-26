export const RUN_TOKEN_PREFIX = "kbr_";

const BEARER_PREFIX = "Bearer ";

/**
 * `kbr_<runId>_<secret>`: Firestore's generated ids have no `_`, so the first one after the
 * prefix splits the parts, and the secret is 32 random bytes in base64url (43 characters).
 * Kept free of `node:crypto` so the edge proxy can read the run id to pick a rate limit bucket.
 */
const RUN_TOKEN = /^kbr_([A-Za-z0-9]{1,128})_([A-Za-z0-9_-]{43})$/;

export type ParsedRunToken = { runId: string; secret: string };

export function parseRunToken(token: string | null): ParsedRunToken | null {
    const match = token === null ? null : RUN_TOKEN.exec(token);
    return match ? { runId: match[1], secret: match[2] } : null;
}

export function readBearer(header: string | null): string | null {
    if (!header?.startsWith(BEARER_PREFIX)) {
        return null;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    return token === "" ? null : token;
}
