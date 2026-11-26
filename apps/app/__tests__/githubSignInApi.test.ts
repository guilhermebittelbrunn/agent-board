import { getDictionaryForLocale } from "@repo/internationalization/client";
import { removeCookie, setCookie } from "@repo/shared/utils/helpers/cookies";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    authClient,
    signInWithPopupMock,
    signOutMock,
    credentialFromResultMock,
    getIdTokenMock,
    signInWithGithubMock,
    setAuthorizationHeaderMock,
    isNewAccountMock,
} = vi.hoisted(() => ({
    authClient: { name: "auth-client" },
    signInWithPopupMock: vi.fn(),
    signOutMock: vi.fn(),
    credentialFromResultMock: vi.fn(),
    getIdTokenMock: vi.fn(),
    signInWithGithubMock: vi.fn(),
    setAuthorizationHeaderMock: vi.fn(),
    isNewAccountMock: vi.fn(),
}));

vi.mock("@repo/auth/client", () => ({
    getAuthClient: () => authClient,
    isNewAccount: (...args: unknown[]) => isNewAccountMock(...args),
}));

vi.mock("firebase/auth", () => ({
    GithubAuthProvider: class {
        readonly providerId = "github.com";

        static credentialFromResult(...args: unknown[]) {
            return credentialFromResultMock(...args);
        }
    },
    signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
    signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        authApi: {
            signInWithGithub: (...args: unknown[]) =>
                signInWithGithubMock(...args),
        },
        setAuthorizationHeader: (...args: unknown[]) =>
            setAuthorizationHeaderMock(...args),
    },
}));

const { signInWithGithubViaApi } = await import("@/shared/lib/githubSignInApi");

const FIREBASE_ID_TOKEN = "firebase-id-token";
const GITHUB_ACCESS_TOKEN = "gho_github-access-token";
const STATUS_OK = 200;
const STATUS_UNAUTHORIZED = 401;
const ONE_HOUR_IN_SECONDS = 3600;
const SESSION_USER = {
    uid: "github-uid",
    type: "common",
    email: "octocat@example.com",
    preferences: null,
};

const POPUP_CREDENTIAL = {
    user: { uid: "github-uid", getIdToken: () => getIdTokenMock() },
};

const fetchMock = vi.fn();

function sessionCalls(method: string) {
    return fetchMock.mock.calls.filter(
        ([url, init]) =>
            String(url).endsWith("/api/auth/session") &&
            (init as RequestInit | undefined)?.method === method
    );
}

beforeEach(() => {
    for (const mock of [
        signInWithPopupMock,
        signOutMock,
        credentialFromResultMock,
        getIdTokenMock,
        signInWithGithubMock,
        setAuthorizationHeaderMock,
        isNewAccountMock,
        fetchMock,
    ]) {
        mock.mockReset();
    }
    signInWithPopupMock.mockResolvedValue(POPUP_CREDENTIAL);
    getIdTokenMock.mockResolvedValue(FIREBASE_ID_TOKEN);
    credentialFromResultMock.mockReturnValue({
        accessToken: GITHUB_ACCESS_TOKEN,
    });
    isNewAccountMock.mockReturnValue(false);
    signInWithGithubMock.mockResolvedValue({ user: SESSION_USER });
    signOutMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, status: STATUS_OK });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    removeCookie("x-locale");
});

describe("signInWithGithubViaApi — o que vai para a API", () => {
    it("sends only the Firebase ID token, never the GitHub access token", async () => {
        await signInWithGithubViaApi();

        expect(signInWithGithubMock).toHaveBeenCalledWith({
            idToken: FIREBASE_ID_TOKEN,
        });
        const everythingSent = JSON.stringify([
            signInWithGithubMock.mock.calls,
            fetchMock.mock.calls,
        ]);
        expect(everythingSent).not.toContain(GITHUB_ACCESS_TOKEN);
        expect(credentialFromResultMock).not.toHaveBeenCalled();
    });

    it("writes the session cookie with the same Firebase ID token", async () => {
        const result = await signInWithGithubViaApi();

        const [post] = sessionCalls("POST");
        expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
            idToken: FIREBASE_ID_TOKEN,
        });
        expect(result).toEqual({
            idToken: FIREBASE_ID_TOKEN,
            user: SESSION_USER,
        });
        expect(setAuthorizationHeaderMock).toHaveBeenCalledWith(
            FIREBASE_ID_TOKEN
        );
        expect(signOutMock).not.toHaveBeenCalled();
    });
});

describe("signInWithGithubViaApi — recusas", () => {
    it("signs the popup user out, drops the cookie and rethrows when the API refuses", async () => {
        const refusal = Object.assign(new Error("Request failed"), {
            response: {
                status: 502,
                data: { error: { code: "AUTH_GITHUB_PROFILE_UNAVAILABLE" } },
            },
        });
        signInWithGithubMock.mockRejectedValue(refusal);

        await expect(signInWithGithubViaApi()).rejects.toBe(refusal);
        expect(signOutMock).toHaveBeenCalledWith(authClient);
        expect(sessionCalls("POST")).toHaveLength(0);
        expect(sessionCalls("DELETE")).toHaveLength(1);
    });

    it("signs the popup user out with the translated copy when the session cookie cannot be written", async () => {
        setCookie("x-locale", "pt-br", ONE_HOUR_IN_SECONDS);
        fetchMock.mockResolvedValue({ ok: false, status: STATUS_UNAUTHORIZED });

        await expect(signInWithGithubViaApi()).rejects.toThrow(
            getDictionaryForLocale("pt-br").dictionary.packages.auth.provider
                .session.notEstablished
        );
        expect(signOutMock).toHaveBeenCalledWith(authClient);
        expect(setAuthorizationHeaderMock).not.toHaveBeenCalled();
    });

    it("surfaces the API refusal even when signing out and dropping the cookie fail", async () => {
        const refusal = new Error("Request failed");
        signInWithGithubMock.mockRejectedValue(refusal);
        signOutMock.mockRejectedValue(new Error("sign-out failed"));
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

        await expect(signInWithGithubViaApi()).rejects.toBe(refusal);
    });

    it("does not sign out when the popup itself fails", async () => {
        signInWithPopupMock.mockRejectedValue(
            Object.assign(new Error("popup"), {
                code: "auth/popup-closed-by-user",
            })
        );

        await expect(signInWithGithubViaApi()).rejects.toThrow("popup");
        expect(signOutMock).not.toHaveBeenCalled();
        expect(signInWithGithubMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("signInWithGithubViaApi — conta nova", () => {
    it("reports a new account before the API exchange", async () => {
        isNewAccountMock.mockReturnValue(true);
        const onAccountCreated = vi.fn();

        await signInWithGithubViaApi({ onAccountCreated });

        expect(isNewAccountMock).toHaveBeenCalledWith(POPUP_CREDENTIAL);
        expect(onAccountCreated).toHaveBeenCalledTimes(1);
        expect(onAccountCreated.mock.invocationCallOrder[0]).toBeLessThan(
            signInWithGithubMock.mock.invocationCallOrder[0] ?? 0
        );
    });

    it("does not report an account that already existed", async () => {
        const onAccountCreated = vi.fn();

        await signInWithGithubViaApi({ onAccountCreated });

        expect(onAccountCreated).not.toHaveBeenCalled();
    });

    it("still reports the created account when the API exchange fails afterwards", async () => {
        isNewAccountMock.mockReturnValue(true);
        signInWithGithubMock.mockRejectedValue(new Error("Request failed"));
        const onAccountCreated = vi.fn();

        await expect(
            signInWithGithubViaApi({ onAccountCreated })
        ).rejects.toThrow("Request failed");
        expect(onAccountCreated).toHaveBeenCalledTimes(1);
    });
});
