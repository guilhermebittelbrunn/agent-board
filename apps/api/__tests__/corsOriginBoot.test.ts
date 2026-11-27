// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getFirestoreAdminMock } = vi.hoisted(() => ({
    getFirestoreAdminMock: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
    getFirestoreAdmin: getFirestoreAdminMock,
}));

const { register } = await import("@/instrumentation");

const MISSING_CORS_ORIGIN_LINE =
    /^\[boot] CORS_ORIGIN is required in production/;
const EXIT_FAILURE = 1;
const RATE_LIMIT_DISABLED = /rate limiting is DISABLED/;
const MALFORMED_ARCJET_KEY = /does not start with "ajkey_"/;
const SCHEDULED_TASKS_OFF = /saving scheduled tasks is switched off/;
const CREDENTIALS_KEY_BYTES = 32;
const VALID_CREDENTIALS_KEY = Buffer.alloc(CREDENTIALS_KEY_BYTES, "k").toString(
    "base64"
);

const MANAGED_VARS = [
    "NODE_ENV",
    "NEXT_RUNTIME",
    "CORS_ORIGIN",
    "ARCJET_KEY",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
    "CREDENTIALS_ENCRYPTION_KEY",
];
const originalEnv = { ...process.env };

function givenBootEnv(vars: Record<string, string>) {
    for (const name of MANAGED_VARS) {
        Reflect.deleteProperty(process.env, name);
    }
    Object.assign(process.env, { NEXT_RUNTIME: "nodejs" }, vars);
}

beforeEach(() => {
    getFirestoreAdminMock.mockReset();
    getFirestoreAdminMock.mockReturnValue({});
    vi.spyOn(console, "warn").mockImplementation(() => {
        // silence the expected boot warning
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    for (const name of MANAGED_VARS) {
        Reflect.deleteProperty(process.env, name);
    }
    Object.assign(process.env, originalEnv);
});

function spyOnExit() {
    return vi.spyOn(process, "exit").mockImplementation((() => {
        // keep the test runner alive; the call itself is what is asserted
    }) as never);
}

function spyOnBootError() {
    return vi.spyOn(console, "error").mockImplementation(() => {
        // asserted below, kept out of the test output
    });
}

describe("boot gate for the origin allowlist", () => {
    it.each([
        ["unset", undefined],
        ["empty", ""],
        ["only separators", " , "],
    ])(
        "ends the process in production when the allowlist is %s",
        async (_label, value) => {
            const exit = spyOnExit();
            const error = spyOnBootError();
            givenBootEnv({
                NODE_ENV: "production",
                ...(value === undefined ? {} : { CORS_ORIGIN: value }),
            });

            await register();

            expect(error).toHaveBeenCalledTimes(1);
            expect(error).toHaveBeenCalledWith(
                expect.stringMatching(MISSING_CORS_ORIGIN_LINE)
            );
            expect(exit).toHaveBeenCalledWith(EXIT_FAILURE);
            expect(getFirestoreAdminMock).not.toHaveBeenCalled();
        }
    );

    it("starts in production once the allowlist is configured", async () => {
        const exit = spyOnExit();
        givenBootEnv({
            NODE_ENV: "production",
            CORS_ORIGIN: "https://app.example.com",
        });

        await expect(register()).resolves.toBeUndefined();
        expect(getFirestoreAdminMock).toHaveBeenCalledTimes(1);
        expect(exit).not.toHaveBeenCalled();
    });

    it("starts outside production without one, falling back to localhost", async () => {
        const exit = spyOnExit();
        givenBootEnv({ NODE_ENV: "development" });

        await expect(register()).resolves.toBeUndefined();
        expect(getFirestoreAdminMock).toHaveBeenCalledTimes(1);
        expect(exit).not.toHaveBeenCalled();
    });
});

describe("boot notice for the rate limiter", () => {
    it("says out loud that nothing is being counted", async () => {
        givenBootEnv({ NODE_ENV: "development" });

        await register();

        expect(console.warn).toHaveBeenCalledWith(
            expect.stringMatching(RATE_LIMIT_DISABLED)
        );
    });

    it("stays quiet once a key is configured", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {
            // capture any unexpected boot error
        });
        givenBootEnv({
            NODE_ENV: "development",
            ARCJET_KEY: "ajkey_test",
            GITHUB_APP_ID: "12345",
            GITHUB_APP_PRIVATE_KEY: "test-key",
            GITHUB_WEBHOOK_SECRET: "test-secret",
            CREDENTIALS_ENCRYPTION_KEY: VALID_CREDENTIALS_KEY,
        });

        await register();

        expect(console.warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it("reports a key that is not an Arcjet key as an error, without echoing it", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {
            // silence the expected boot error
        });
        givenBootEnv({ NODE_ENV: "development", ARCJET_KEY: "invalida" });

        await expect(register()).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(
            expect.stringMatching(MALFORMED_ARCJET_KEY)
        );
        expect(JSON.stringify(error.mock.calls)).not.toContain("invalida");
        expect(console.warn).not.toHaveBeenCalledWith(
            expect.stringMatching(RATE_LIMIT_DISABLED)
        );
        expect(getFirestoreAdminMock).toHaveBeenCalledTimes(1);
    });

    it.each(["", "   "])(
        "warns about a blank key %j as an absent one",
        async (value) => {
            const error = vi.spyOn(console, "error").mockImplementation(() => {
                // capture any unexpected boot error
            });
            givenBootEnv({ NODE_ENV: "development", ARCJET_KEY: value });

            await register();

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringMatching(RATE_LIMIT_DISABLED)
            );
            expect(error).not.toHaveBeenCalled();
        }
    );
});

describe("boot notice of the credentials key", () => {
    const leaveEmulator = () => {
        for (const variable of [
            "FIRESTORE_EMULATOR_HOST",
            "FIREBASE_AUTH_EMULATOR_HOST",
            "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
        ]) {
            vi.stubEnv(variable, "");
        }
    };

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("boots and warns when the key is missing outside the emulator", async () => {
        givenBootEnv({ NODE_ENV: "development" });
        leaveEmulator();

        await register();

        expect(console.warn).toHaveBeenCalledWith(
            expect.stringMatching(SCHEDULED_TASKS_OFF)
        );
        expect(getFirestoreAdminMock).toHaveBeenCalled();
    });

    it("reports an invalid key as an error, without echoing it", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {
            // capture the boot error
        });
        const invalidKey = "not-a-real-key-value";
        givenBootEnv({
            NODE_ENV: "development",
            CREDENTIALS_ENCRYPTION_KEY: invalidKey,
        });

        await register();

        expect(error).toHaveBeenCalledWith(
            expect.stringMatching(SCHEDULED_TASKS_OFF)
        );
        for (const call of error.mock.calls) {
            expect(String(call[0])).not.toContain(invalidKey);
        }
        expect(getFirestoreAdminMock).toHaveBeenCalled();
    });
});
