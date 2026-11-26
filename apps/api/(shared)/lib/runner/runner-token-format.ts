/**
 * `kbl_<runnerId>_<secret>`, the same shape as the run token with another prefix, so one
 * can never stand in for the other. Kept free of `node:crypto` so the edge proxy can read
 * the runner id to pick a rate limit bucket.
 */
const RUNNER_TOKEN = /^kbl_([A-Za-z0-9]{1,128})_([A-Za-z0-9_-]{43})$/;

export type ParsedRunnerToken = { runnerId: string; secret: string };

export function parseRunnerToken(
    token: string | null
): ParsedRunnerToken | null {
    const match = token === null ? null : RUNNER_TOKEN.exec(token);
    return match ? { runnerId: match[1], secret: match[2] } : null;
}
