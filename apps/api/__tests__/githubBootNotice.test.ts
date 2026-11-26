import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth/server", () => ({ getFirestoreAdmin: () => ({}) }));

const { register } = await import("@/instrumentation");

const SAMPLE_NOTICE = /^\[github] .*sample repositories of the emulator/;
const OFF_NOTICE =
    /^\[github] .*repository reads answer GITHUB_APP_NOT_CONFIGURED/;
const WEBHOOK_NOTICE = /^\[github] GITHUB_WEBHOOK_SECRET is not set/;

const APP = { GITHUB_APP_ID: "12345", GITHUB_APP_PRIVATE_KEY: "test-key" };

function givenEnv(vars: Record<string, string>): void {
    for (const name of [
        "GITHUB_APP_ID",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_WEBHOOK_SECRET",
        "FIRESTORE_EMULATOR_HOST",
        "FIREBASE_AUTH_EMULATOR_HOST",
        "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
    ]) {
        vi.stubEnv(name, "");
    }
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "development");
    for (const [name, value] of Object.entries(vars)) {
        vi.stubEnv(name, value);
    }
}

const githubNotices = () =>
    vi
        .mocked(console.warn)
        .mock.calls.map(([line]) => String(line))
        .filter((line) => line.startsWith("[github]"));

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {
        // asserted below
    });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("GitHub App boot notice", () => {
    it("announces the sample repositories against the emulator", async () => {
        givenEnv({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" });

        await register();

        const notices = githubNotices();
        expect(notices).toHaveLength(2);
        expect(notices[0]).toMatch(SAMPLE_NOTICE);
        expect(notices[1]).toMatch(WEBHOOK_NOTICE);
    });

    it("announces that reads are off without the App outside the emulator", async () => {
        givenEnv({ GITHUB_WEBHOOK_SECRET: "test-secret" });

        await register();

        const notices = githubNotices();
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatch(OFF_NOTICE);
    });

    it("only mentions the webhook when the App is set without a secret", async () => {
        givenEnv(APP);

        await register();

        const notices = githubNotices();
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatch(WEBHOOK_NOTICE);
    });

    it("stays quiet with the App and the secret, never echoing them", async () => {
        givenEnv({ ...APP, GITHUB_WEBHOOK_SECRET: "test-secret" });

        await register();

        expect(githubNotices()).toEqual([]);
        expect(
            JSON.stringify(vi.mocked(console.warn).mock.calls)
        ).not.toContain("test-key");
    });
});
