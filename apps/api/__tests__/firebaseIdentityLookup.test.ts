import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    IdentityToolkitError,
    identityLookupProvider,
} from "@/(shared)/lib/firebase-identity-toolkit";

vi.mock("server-only", () => ({}));

const STATUS_BAD_REQUEST = 400;

const GITHUB_INFO = {
    providerId: "github.com",
    rawId: "583231",
    screenName: "octocat",
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        })
    );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn(() =>
        jsonResponse({
            users: [
                {
                    providerUserInfo: [
                        { providerId: "password", rawId: "a@b.com" },
                        GITHUB_INFO,
                    ],
                },
            ],
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", "");
    vi.stubEnv("FIREBASE_WEB_API_KEY", "real-key");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("identityLookupProvider", () => {
    it("calls accounts:lookup in production with the ID token as the body", async () => {
        await identityLookupProvider("id-token", "github.com");

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=real-key"
        );
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual({ idToken: "id-token" });
    });

    it("routes through the emulator when the host is set", async () => {
        vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");

        await identityLookupProvider("id-token", "github.com");

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=real-key"
        );
    });

    it("returns only the entry of the requested provider", async () => {
        await expect(
            identityLookupProvider("id-token", "github.com")
        ).resolves.toEqual(GITHUB_INFO);
    });

    it("returns null when the account has no entry for the provider", async () => {
        await expect(
            identityLookupProvider("id-token", "google.com")
        ).resolves.toBeNull();
    });

    it("returns null when the account comes back empty", async () => {
        fetchMock.mockImplementation(() => jsonResponse({}));

        await expect(
            identityLookupProvider("id-token", "github.com")
        ).resolves.toBeNull();
    });

    it("turns a toolkit error into IdentityToolkitError", async () => {
        fetchMock.mockImplementation(() =>
            jsonResponse(
                {
                    error: {
                        message: "INVALID_ID_TOKEN",
                        code: STATUS_BAD_REQUEST,
                    },
                },
                STATUS_BAD_REQUEST
            )
        );

        const failure = identityLookupProvider("id-token", "github.com");

        await expect(failure).rejects.toBeInstanceOf(IdentityToolkitError);
        await expect(failure).rejects.toThrow("INVALID_ID_TOKEN");
    });

    it("refuses to call production without a web API key", async () => {
        vi.stubEnv("FIREBASE_WEB_API_KEY", "");
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");

        await expect(
            identityLookupProvider("id-token", "github.com")
        ).rejects.toBeInstanceOf(IdentityToolkitError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
