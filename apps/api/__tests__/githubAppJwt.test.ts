import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { githubAppCredentials } from "@/(shared)/lib/github/github-app-config";
import { createAppJwt } from "@/(shared)/lib/github/github-app-jwt";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
});

const NOW = 1_800_000_000;
const JWT_SEGMENTS = 3;
const LIFETIME_SECONDS = 540;
const CLOCK_SKEW_SECONDS = 60;

const decode = (segment: string) =>
    JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

describe("createAppJwt", () => {
    it("signs an RS256 token issued by the App, valid for under 10 minutes", () => {
        const jwt = createAppJwt({ appId: "12345", privateKey }, NOW);
        const segments = jwt.split(".");

        expect(segments).toHaveLength(JWT_SEGMENTS);
        expect(decode(segments[0])).toEqual({ alg: "RS256", typ: "JWT" });
        expect(decode(segments[1])).toEqual({
            iat: NOW - CLOCK_SKEW_SECONDS,
            exp: NOW + LIFETIME_SECONDS,
            iss: "12345",
        });
        expect(
            verify(
                "RSA-SHA256",
                Buffer.from(`${segments[0]}.${segments[1]}`),
                publicKey,
                Buffer.from(segments[2], "base64url")
            )
        ).toBe(true);
    });

    it("accepts a private key whose newlines were escaped in the environment", () => {
        const credentials = githubAppCredentials({
            GITHUB_APP_ID: "12345",
            GITHUB_APP_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
        });
        expect(credentials).not.toBeNull();

        const [header, payload, signature] = createAppJwt(
            credentials as NonNullable<typeof credentials>,
            NOW
        ).split(".");

        expect(
            verify(
                "RSA-SHA256",
                Buffer.from(`${header}.${payload}`),
                publicKey,
                Buffer.from(signature, "base64url")
            )
        ).toBe(true);
    });
});
