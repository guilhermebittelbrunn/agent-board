import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidWebhookSignature } from "@/(shared)/lib/github/github-webhook-signature";

const SECRET = "test-webhook-secret";
const SHA1_HEX_LENGTH = 40;
const SHA256_HEX_LENGTH = 64;
const BODY = Buffer.from('{"action":"added"}');

const sign = (body: Buffer, secret = SECRET) =>
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("isValidWebhookSignature", () => {
    it("accepts the HMAC of the exact body", () => {
        expect(isValidWebhookSignature(BODY, sign(BODY), SECRET)).toBe(true);
    });

    it.each([
        ["a missing header", null],
        [
            "a header without the sha256= prefix",
            sign(BODY).replace("sha256=", ""),
        ],
        ["a sha1 signature", `sha1=${"a".repeat(SHA1_HEX_LENGTH)}`],
        ["a digest of another length", "sha256=abcd"],
        ["a non-hex digest", `sha256=${"z".repeat(SHA256_HEX_LENGTH)}`],
        ["a body changed by one byte", sign(Buffer.from('{"action":"addee"}'))],
        ["another secret", sign(BODY, "another-secret")],
    ])("refuses %s without throwing", (_case, header) => {
        expect(isValidWebhookSignature(BODY, header, SECRET)).toBe(false);
    });
});
