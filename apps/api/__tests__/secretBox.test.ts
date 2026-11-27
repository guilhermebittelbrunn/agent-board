import { afterEach, describe, expect, it, vi } from "vitest";
import {
    credentialsKey,
    credentialsKeyState,
} from "@/(shared)/lib/credentials/credentials-key";
import { openSecret, sealSecret } from "@/(shared)/lib/credentials/secret-box";

const KEY_BYTES = 32;
const SHORT_KEY_BYTES = 31;
const KEY = Buffer.alloc(KEY_BYTES, "k");
const OTHER_KEY = Buffer.alloc(KEY_BYTES, "o");
const TAG_PART = 2;
const BODY_PART = 3;
const VERSION_PREFIX = /^v1/;
const AAD = "board__user__analyze";
const PLAINTEXT = JSON.stringify({ fireUrl: "https://x", token: "secret" });

const EMULATOR_VARIABLES = [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
] as const;

function leaveEmulator() {
    for (const variable of EMULATOR_VARIABLES) {
        vi.stubEnv(variable, "");
    }
}

function enterEmulator() {
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
}

afterEach(() => {
    vi.unstubAllEnvs();
});

function tamper(sealed: string, index: number): string {
    const parts = sealed.split(".");
    const bytes = Buffer.from(parts[index], "base64url");
    bytes[0] = bytes[0] === 0 ? 1 : 0;
    parts[index] = bytes.toString("base64url");
    return parts.join(".");
}

describe("sealSecret / openSecret", () => {
    it("opens what it sealed, with a fresh IV every time", () => {
        const first = sealSecret(KEY, PLAINTEXT, AAD);
        const second = sealSecret(KEY, PLAINTEXT, AAD);

        expect(first.startsWith("v1.")).toBe(true);
        expect(first).not.toBe(second);
        expect(first).not.toContain("secret");
        expect(openSecret(KEY, first, AAD)).toBe(PLAINTEXT);
        expect(openSecret(KEY, second, AAD)).toBe(PLAINTEXT);
    });

    it("refuses another document's aad", () => {
        const sealed = sealSecret(KEY, PLAINTEXT, AAD);
        expect(openSecret(KEY, sealed, "board__other__analyze")).toBeNull();
    });

    it("refuses a tampered tag or body, and another key", () => {
        const sealed = sealSecret(KEY, PLAINTEXT, AAD);
        expect(openSecret(KEY, tamper(sealed, TAG_PART), AAD)).toBeNull();
        expect(openSecret(KEY, tamper(sealed, BODY_PART), AAD)).toBeNull();
        expect(openSecret(OTHER_KEY, sealed, AAD)).toBeNull();
    });

    it("refuses an unknown version or a malformed value", () => {
        const sealed = sealSecret(KEY, PLAINTEXT, AAD);
        expect(
            openSecret(KEY, sealed.replace(VERSION_PREFIX, "v2"), AAD)
        ).toBeNull();
        expect(openSecret(KEY, "v1.abc", AAD)).toBeNull();
        expect(openSecret(KEY, `${sealed}.extra`, AAD)).toBeNull();
    });
});

describe("credentialsKeyState", () => {
    it("reads 32 bytes in base64", () => {
        leaveEmulator();
        const state = credentialsKeyState({
            CREDENTIALS_ENCRYPTION_KEY: KEY.toString("base64"),
        });
        expect(state.status).toBe("configured");
        expect(state.key?.equals(KEY)).toBe(true);
    });

    it.each([
        ["31 bytes", Buffer.alloc(SHORT_KEY_BYTES, "k").toString("base64")],
        ["text that is not base64", "not a key!"],
    ])(
        "switches the feature off for %s, even in the emulator",
        (_label, value) => {
            enterEmulator();
            expect(
                credentialsKeyState({ CREDENTIALS_ENCRYPTION_KEY: value })
            ).toEqual({ status: "invalid", key: null });
        }
    );

    it("has no key outside the emulator when the variable is empty", () => {
        leaveEmulator();
        expect(credentialsKey({ CREDENTIALS_ENCRYPTION_KEY: "" })).toBeNull();
        expect(credentialsKeyState({}).status).toBe("absent");
    });

    it("uses the emulator-only key when the variable is empty against the emulator", () => {
        enterEmulator();
        const state = credentialsKeyState({ CREDENTIALS_ENCRYPTION_KEY: "" });
        expect(state.status).toBe("emulator");
        expect(state.key?.length).toBe(KEY_BYTES);
    });

    it("has no key when only the Auth emulator host is set", () => {
        leaveEmulator();
        vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
        expect(credentialsKeyState({}).status).toBe("absent");
    });
});
