import { createHash } from "node:crypto";

/** 32 random bytes in base64url. */
export const RUN_SECRET_LENGTH = 43;

/** A well-formed run token secret. */
export const RUN_SECRET = "S".repeat(RUN_SECRET_LENGTH);

export const hashRunSecretForTest = (secret: string): string =>
    createHash("sha256").update(secret, "utf8").digest("hex");
