import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export function isValidWebhookSignature(
    body: Buffer,
    header: string | null,
    secret: string
): boolean {
    if (!header?.startsWith(SIGNATURE_PREFIX)) {
        return false;
    }
    const received = Buffer.from(header.slice(SIGNATURE_PREFIX.length), "hex");
    const expected = createHmac("sha256", secret).update(body).digest();

    return (
        received.length === expected.length &&
        timingSafeEqual(received, expected)
    );
}
