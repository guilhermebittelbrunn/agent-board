import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM with a fresh IV per write. `aad` binds the ciphertext to one document, so a
 * sealed value copied onto another person's document does not open there.
 */
export function sealSecret(
    key: Buffer,
    plaintext: string,
    aad: string
): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const body = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    return [VERSION, iv, cipher.getAuthTag(), body]
        .map((part) =>
            typeof part === "string" ? part : part.toString("base64url")
        )
        .join(".");
}

/** `null` for a wrong key, a tampered value, another document's `aad` or an unknown version. */
export function openSecret(
    key: Buffer,
    sealed: string,
    aad: string
): string | null {
    const [version, iv, tag, body, ...rest] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || !body || rest.length > 0) {
        return null;
    }
    const tagBytes = Buffer.from(tag, "base64url");
    if (tagBytes.length !== TAG_BYTES) {
        return null;
    }
    try {
        const decipher = createDecipheriv(
            ALGORITHM,
            key,
            Buffer.from(iv, "base64url"),
            { authTagLength: TAG_BYTES }
        );
        decipher.setAAD(Buffer.from(aad, "utf8"));
        decipher.setAuthTag(tagBytes);
        return Buffer.concat([
            decipher.update(Buffer.from(body, "base64url")),
            decipher.final(),
        ]).toString("utf8");
    } catch {
        return null;
    }
}
