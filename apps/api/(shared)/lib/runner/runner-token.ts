import { randomBytes } from "node:crypto";
import { RUNNER_TOKEN_PREFIX } from "@repo/kanban-contract";
import { hashRunSecret } from "@/(shared)/lib/agent-contract/run-token";

const SECRET_BYTES = 32;
const LAST_CHARS = 4;

/** The token leaves the API once, at registration; only the hash of its secret is stored. */
export function mintRunnerToken(runnerId: string): {
    token: string;
    tokenHash: string;
    tokenLast4: string;
} {
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    return {
        token: `${RUNNER_TOKEN_PREFIX}${runnerId}_${secret}`,
        tokenHash: hashRunSecret(secret),
        tokenLast4: secret.slice(-LAST_CHARS),
    };
}
