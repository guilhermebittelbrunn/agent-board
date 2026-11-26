import { createHash, randomInt } from "node:crypto";
import {
    RUNNER_CODE_ALPHABET,
    RUNNER_CODE_LENGTH,
} from "@repo/kanban-contract";

export function mintRunnerCode(): string {
    let code = "";
    for (let index = 0; index < RUNNER_CODE_LENGTH; index += 1) {
        code += RUNNER_CODE_ALPHABET[randomInt(RUNNER_CODE_ALPHABET.length)];
    }
    return code;
}

/** The registration is stored under the hash, so the code itself is never in the database. */
export function hashRunnerCode(normalizedCode: string): string {
    return createHash("sha256").update(normalizedCode, "utf8").digest("hex");
}
