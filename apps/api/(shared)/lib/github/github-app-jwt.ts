import { sign } from "node:crypto";
import type { GithubAppCredentials } from "./github-app-config";

const MS_PER_SECOND = 1000;
const CLOCK_SKEW_SECONDS = 60;
// GitHub refuses an App JWT whose expiry is more than 10 minutes after its issue time.
const JWT_LIFETIME_SECONDS = 540;

const base64url = (value: string): string =>
    Buffer.from(value).toString("base64url");

export function createAppJwt(
    { appId, privateKey }: GithubAppCredentials,
    nowSeconds = Math.floor(Date.now() / MS_PER_SECOND)
): string {
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(
        JSON.stringify({
            iat: nowSeconds - CLOCK_SKEW_SECONDS,
            exp: nowSeconds + JWT_LIFETIME_SECONDS,
            iss: appId,
        })
    );
    const signature = sign(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        privateKey
    ).toString("base64url");

    return `${header}.${payload}.${signature}`;
}
