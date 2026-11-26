/**
 * The two lines of `(shared)/lib/agent-contract/run-token.ts` the emulator script needs,
 * repeated here because a script cannot import the API's TypeScript. A test keeps both in
 * step.
 */
import { createHash, randomBytes } from "node:crypto";

const SECRET_BYTES = 32;

export const hashRunSecret = (secret) =>
    createHash("sha256").update(secret, "utf8").digest("hex");

export const mintRunToken = (runId) => {
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    return {
        token: `kbr_${runId}_${secret}`,
        tokenHash: hashRunSecret(secret),
    };
};
