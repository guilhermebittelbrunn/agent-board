import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
    envMock: {} as Record<string, string | undefined>,
}));

vi.mock("@/env", () => ({ env: envMock }));

const { resolveGithubClientMode } = await import(
    "@/(shared)/lib/github/github-app-config"
);
const { getGithubClient } = await import("@/(shared)/lib/github/github-client");
const { githubFakeClient } = await import(
    "@/(shared)/lib/github/github-fake-client"
);

const APP = {
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
};

function emulate(on: boolean): void {
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", on ? "127.0.0.1:8080" : "");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", on ? "127.0.0.1:9099" : "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", "");
}

beforeEach(() => {
    for (const key of Object.keys(envMock)) {
        Reflect.deleteProperty(envMock, key);
    }
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("resolveGithubClientMode", () => {
    it("uses the App when both id and key are set", () => {
        emulate(false);
        expect(resolveGithubClientMode(APP)).toBe("app");
    });

    it("prefers the App over the emulator", () => {
        emulate(true);
        expect(resolveGithubClientMode(APP)).toBe("app");
    });

    it("falls back to the sample repositories against the emulator", () => {
        emulate(true);
        expect(resolveGithubClientMode({})).toBe("fake");
    });

    it("is off without the App outside the emulator", () => {
        emulate(false);
        expect(resolveGithubClientMode({})).toBe("off");
    });

    it.each([
        ["an empty id", { ...APP, GITHUB_APP_ID: "" }],
        ["an empty key", { ...APP, GITHUB_APP_PRIVATE_KEY: "" }],
        ["only the id", { GITHUB_APP_ID: "12345" }],
    ])("reads %s as no App", (_case, variables) => {
        emulate(false);
        expect(resolveGithubClientMode(variables)).toBe("off");
    });
});

describe("getGithubClient", () => {
    it("returns no client without the App outside the emulator", () => {
        emulate(false);
        expect(getGithubClient()).toBeNull();
    });

    it("returns the sample client against the emulator", () => {
        emulate(true);
        expect(getGithubClient()).toBe(githubFakeClient);
    });

    it("returns the REST client when the App is configured", () => {
        emulate(true);
        Object.assign(envMock, APP);

        const client = getGithubClient();

        expect(client).not.toBeNull();
        expect(client).not.toBe(githubFakeClient);
        expect(getGithubClient()).toBe(client);
    });
});
