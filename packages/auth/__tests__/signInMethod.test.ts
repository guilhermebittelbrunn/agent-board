import { afterEach, describe, expect, it, vi } from "vitest";
import { isAcceptedSignInMethod } from "../sign-in-method";

afterEach(() => {
    vi.unstubAllEnvs();
});

function outsideEmulator(): void {
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", "");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
}

function insideEmulator(): void {
    outsideEmulator();
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
}

describe("isAcceptedSignInMethod", () => {
    it.each(["github.com", "custom"])(
        "accepts %s outside the emulator",
        (provider) => {
            outsideEmulator();

            expect(isAcceptedSignInMethod(provider)).toBe(true);
        }
    );

    it.each(["github.com", "custom"])(
        "accepts %s inside the emulator",
        (provider) => {
            insideEmulator();

            expect(isAcceptedSignInMethod(provider)).toBe(true);
        }
    );

    it("refuses password outside the emulator", () => {
        outsideEmulator();

        expect(isAcceptedSignInMethod("password")).toBe(false);
    });

    it("accepts password inside the emulator", () => {
        insideEmulator();

        expect(isAcceptedSignInMethod("password")).toBe(true);
    });

    it.each([
        ["google.com", "google.com"],
        ["anonymous", "anonymous"],
        ["missing", undefined],
        ["empty", ""],
    ])("refuses %s even inside the emulator", (_label, provider) => {
        insideEmulator();

        expect(isAcceptedSignInMethod(provider)).toBe(false);
    });
});
