import { firestoreEmulatorHost } from "@repo/auth/emulator";

/** AES-256 takes a 32-byte key. */
export const SECRET_KEY_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Only ever used while the Firestore emulator holds the data, so nothing sealed with it
 * reaches a real project. It is public on purpose: anything sealed with it is as good as
 * plain text. Gated on the Firestore host alone, not `isEmulated()`: an Auth emulator host
 * left in a deployed environment must not seal real documents with a public key.
 */
const EMULATOR_KEY = Buffer.from("agent-board-emulator-only-key-32", "utf8");

/**
 * Takes the variables instead of importing `@/env` so the boot notice in
 * `instrumentation.ts` can read `process.env` without validating every other variable.
 */
export type CredentialsKeyVariables = { CREDENTIALS_ENCRYPTION_KEY?: string };

export type CredentialsKeyState =
    | { status: "configured"; key: Buffer }
    | { status: "emulator"; key: Buffer }
    | { status: "absent"; key: null }
    | { status: "invalid"; key: null };

function decodeKey(value: string): Buffer | null {
    const trimmed = value.trim();
    if (!BASE64.test(trimmed)) {
        return null;
    }
    const key = Buffer.from(trimmed, "base64");
    return key.length === SECRET_KEY_BYTES ? key : null;
}

/** An invalid key switches the feature off even in the emulator, so the degraded mode can be tried. */
export function credentialsKeyState(
    variables: CredentialsKeyVariables
): CredentialsKeyState {
    const value = variables.CREDENTIALS_ENCRYPTION_KEY || "";
    if (value) {
        const key = decodeKey(value);
        return key
            ? { status: "configured", key }
            : { status: "invalid", key: null };
    }
    return firestoreEmulatorHost()
        ? { status: "emulator", key: EMULATOR_KEY }
        : { status: "absent", key: null };
}

export const credentialsKey = (
    variables: CredentialsKeyVariables
): Buffer | null => credentialsKeyState(variables).key;
