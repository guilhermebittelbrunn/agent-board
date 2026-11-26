// @vitest-environment node

import { describe, expect, it } from "vitest";
import { rateLimitSubject } from "@/(shared)/lib/rate-limit-subject";

const HASHED_SUBJECT = /^[0-9a-f]{32}$/;
const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

function jwt(claims: unknown, header: object = { alg: "RS256" }): string {
    return `${encode(header)}.${encode(claims)}.signature`;
}

function requestWith(authorization?: string): Request {
    const headers = new Headers();
    if (authorization !== undefined) {
        headers.set("authorization", authorization);
    }
    return new Request("http://api.test/entities", {
        method: "POST",
        headers,
    });
}

describe("rate limit subject", () => {
    it("gives two tokens of the same account the same bucket", async () => {
        const first = await rateLimitSubject(
            requestWith(`Bearer ${jwt({ sub: "uid-1", iat: 1 })}`)
        );
        const second = await rateLimitSubject(
            requestWith(`Bearer ${jwt({ sub: "uid-1", iat: 2 })}`)
        );

        expect(first).toBe(second);
        expect(first).toMatch(HASHED_SUBJECT);
    });

    it("gives different accounts different buckets", async () => {
        const first = await rateLimitSubject(
            requestWith(`Bearer ${jwt({ sub: "uid-1" })}`)
        );
        const second = await rateLimitSubject(
            requestWith(`Bearer ${jwt({ sub: "uid-2" })}`)
        );

        expect(first).not.toBe(second);
    });

    it("never hands out the subject in clear", async () => {
        const subject = await rateLimitSubject(
            requestWith(`Bearer ${jwt({ sub: "uid-in-clear" })}`)
        );

        expect(subject).not.toContain("uid-in-clear");
    });

    it("reads a subject with characters outside ASCII", async () => {
        const subject = await rateLimitSubject(
            requestWith(`Bearer ${jwt({ sub: "usuário-ç" })}`)
        );

        expect(subject).toMatch(HASHED_SUBJECT);
    });

    it.each([
        ["no authorization header", undefined],
        ["an empty header", ""],
        ["a scheme other than Bearer", `Basic ${jwt({ sub: "uid-1" })}`],
        ["a bearer that is not a JWT", "Bearer opaque-token"],
        ["a JWT whose payload is not JSON", "Bearer aaa.%%%.ccc"],
        ["a JWT without sub", `Bearer ${jwt({ iat: 1 })}`],
        ["a JWT with an empty sub", `Bearer ${jwt({ sub: "" })}`],
        ["a JWT with a numeric sub", `Bearer ${jwt({ sub: 42 })}`],
        ["a JWT whose payload is not an object", `Bearer ${jwt("uid-1")}`],
    ])("falls back to anonymous with %s", async (_label, authorization) => {
        await expect(
            rateLimitSubject(requestWith(authorization))
        ).resolves.toBe("anonymous");
    });
});

describe("rate limit subject of an agent run token", () => {
    const SECRET_LENGTH = 43;
    const SECRET = "A".repeat(SECRET_LENGTH);

    it("gives each run its own bucket, whatever the secret", async () => {
        const first = await rateLimitSubject(
            requestWith(`Bearer kbr_run1_${SECRET}`)
        );
        const again = await rateLimitSubject(
            requestWith(`Bearer kbr_run1_${"B".repeat(SECRET_LENGTH)}`)
        );
        const other = await rateLimitSubject(
            requestWith(`Bearer kbr_run2_${SECRET}`)
        );

        expect(first).toMatch(HASHED_SUBJECT);
        expect(first).toBe(again);
        expect(first).not.toBe(other);
        expect(first).not.toContain("run1");
    });

    it("leaves a malformed run token in the anonymous bucket", async () => {
        expect(
            await rateLimitSubject(requestWith("Bearer kbr_run1_short"))
        ).toBe("anonymous");
    });
});

describe("rate limit subject of a local runner token", () => {
    const RUNNER_SECRET_LENGTH = 43;
    const SECRET = "A".repeat(RUNNER_SECRET_LENGTH);

    it("gives each runner its own bucket, apart from a run with the same id", async () => {
        const runner = await rateLimitSubject(
            requestWith(`Bearer kbl_abc_${SECRET}`)
        );
        const otherRunner = await rateLimitSubject(
            requestWith(`Bearer kbl_xyz_${SECRET}`)
        );
        const run = await rateLimitSubject(
            requestWith(`Bearer kbr_abc_${SECRET}`)
        );

        expect(runner).toMatch(HASHED_SUBJECT);
        expect(runner).not.toBe(otherRunner);
        expect(runner).not.toBe(run);
        expect(runner).not.toContain("abc");
    });

    it("leaves a malformed runner token in the anonymous bucket", async () => {
        expect(
            await rateLimitSubject(requestWith("Bearer kbl_abc_short"))
        ).toBe("anonymous");
    });
});
