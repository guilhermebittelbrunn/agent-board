import { LOCALE_REQUEST_HEADER } from "@repo/internationalization/utils";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    getUserFromSessionCookieMock,
    secureMock,
    cookieSetMock,
    sessionCheckMock,
    clearSessionCookieMock,
} = vi.hoisted(() => ({
    getUserFromSessionCookieMock: vi.fn(),
    secureMock: vi.fn(),
    cookieSetMock: vi.fn(),
    sessionCheckMock: vi.fn(),
    clearSessionCookieMock: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
    getUserFromSessionCookie: (...args: unknown[]) =>
        getUserFromSessionCookieMock(...args),
}));

vi.mock("@repo/auth/session", () => ({
    clearSessionCookie: () => clearSessionCookieMock(),
}));

vi.mock("@/lib/server/sessionAuthority", () => ({
    sessionAuthority: {
        check: (...args: unknown[]) => sessionCheckMock(...args),
        end: vi.fn(),
    },
}));

vi.mock("@repo/security", () => ({
    secure: (...args: unknown[]) => secureMock(...args),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ set: cookieSetMock }),
}));

vi.mock("@/env", () => ({ env: { ARCJET_KEY: undefined } }));

const proxy = (await import("@/proxy")).default;

const ORIGIN = "http://localhost:3000";
const HTTPS_ORIGIN = "https://app.example.com";
const ONE_HUNDRED_EIGHTY_DAYS_IN_SECONDS = 15_552_000;

const localeCookieOptions = (secure: boolean) => ({
    path: "/",
    sameSite: "lax",
    maxAge: ONE_HUNDRED_EIGHTY_DAYS_IN_SECONDS,
    secure,
});
const TEMPORARY_REDIRECT = 307;
const FORWARDED_LOCALE = `x-middleware-request-${LOCALE_REQUEST_HEADER}`;

function makeNextUrl(href: string) {
    const url = new URL(href) as URL & { clone: () => URL };
    url.clone = () => makeNextUrl(url.href);
    return url;
}

const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function makeRequest(
    path: string,
    options?: { token?: string; origin?: string }
) {
    const href = `${options?.origin ?? ORIGIN}${path}`;
    return {
        method: "GET",
        url: href,
        nextUrl: makeNextUrl(href),
        headers: new Headers({ "user-agent": BROWSER_UA }),
        cookies: {
            get: (name: string) =>
                name === "access-token" && options?.token
                    ? { value: options.token }
                    : undefined,
        },
    } as unknown as NextRequest;
}

function signedIn(path: string) {
    getUserFromSessionCookieMock.mockResolvedValue({ uid: "uid-1" });
    return makeRequest(path, { token: "session-cookie" });
}

function anonymous(path: string) {
    getUserFromSessionCookieMock.mockResolvedValue(null);
    return makeRequest(path);
}

function locationOf(response: Response): string | null {
    const location = response.headers.get("location");
    return location ? location.replace(ORIGIN, "") : null;
}

beforeEach(() => {
    getUserFromSessionCookieMock.mockReset();
    secureMock.mockReset();
    cookieSetMock.mockReset();
    sessionCheckMock.mockReset();
    sessionCheckMock.mockResolvedValue("active");
    clearSessionCookieMock.mockReset();
    clearSessionCookieMock.mockResolvedValue(undefined);
});

describe("proxy static assets", () => {
    it("serves a path ending in a file extension without looking up the session", async () => {
        for (const path of ["/logo.png", "/pt-br/brand/icon.svg", "/sw.js"]) {
            const response = await proxy(makeRequest(path));

            expect(locationOf(response)).toBeNull();
            expect(getUserFromSessionCookieMock).not.toHaveBeenCalled();
        }
    });
});

describe("proxy locale", () => {
    it("prefixes a path that has no locale with the default one", async () => {
        const response = await proxy(anonymous("/boards"));

        expect(locationOf(response)).toBe("/pt-br/boards");
    });

    it("keeps the query when it prefixes the locale", async () => {
        const response = await proxy(
            anonymous("/account?tab=billing&plan=price_1")
        );

        expect(locationOf(response)).toBe(
            "/pt-br/account?tab=billing&plan=price_1"
        );
    });

    it("stores the locale of the path being served", async () => {
        await proxy(anonymous("/pt-br/sign-in"));

        expect(cookieSetMock).toHaveBeenCalledWith(
            "x-locale",
            "pt-br",
            localeCookieOptions(false)
        );
    });

    it("keeps the default locale for 180 days on the redirect, without Secure over HTTP", async () => {
        await proxy(anonymous("/boards"));

        expect(cookieSetMock).toHaveBeenCalledWith(
            "x-locale",
            "pt-br",
            localeCookieOptions(false)
        );
    });

    it("marks the locale cookie Secure when the request arrived over HTTPS", async () => {
        getUserFromSessionCookieMock.mockResolvedValue(null);

        await proxy(makeRequest("/pt-br/sign-in", { origin: HTTPS_ORIGIN }));
        await proxy(makeRequest("/boards", { origin: HTTPS_ORIGIN }));

        expect(cookieSetMock.mock.calls).toEqual([
            ["x-locale", "pt-br", localeCookieOptions(true)],
            ["x-locale", "pt-br", localeCookieOptions(true)],
        ]);
    });

    it("hands the locale of the path to server rendering", async () => {
        const anonymousResponse = await proxy(anonymous("/pt-br/sign-in"));
        const signedInResponse = await proxy(signedIn("/pt-br/boards"));

        expect(anonymousResponse.headers.get(FORWARDED_LOCALE)).toBe("pt-br");
        expect(signedInResponse.headers.get(FORWARDED_LOCALE)).toBe("pt-br");
        expect(
            signedInResponse.headers.get("x-middleware-override-headers")
        ).toContain(LOCALE_REQUEST_HEADER);
    });

    it("replaces a locale header the browser sent", async () => {
        const request = signedIn("/pt-br/boards");
        request.headers.set(LOCALE_REQUEST_HEADER, "es");

        const response = await proxy(request);

        expect(response.headers.get(FORWARDED_LOCALE)).toBe("pt-br");
    });

    it("drops a locale header the browser sent for a static asset", async () => {
        const request = makeRequest("/missing-file.txt");
        request.headers.set(LOCALE_REQUEST_HEADER, "es");

        const response = await proxy(request);

        const kept = response.headers.get("x-middleware-override-headers");
        expect(kept).not.toBeNull();
        expect(kept).not.toContain(LOCALE_REQUEST_HEADER);
        expect(response.headers.get("x-middleware-request-user-agent")).toBe(
            BROWSER_UA
        );
    });

    it("leaves a plain static asset request untouched", async () => {
        const response = await proxy(makeRequest("/logo.png"));

        expect(
            response.headers.get("x-middleware-override-headers")
        ).toBeNull();
    });
});

describe("proxy default deny", () => {
    it("sends an anonymous visitor to sign-in keeping the deep link", async () => {
        const response = await proxy(anonymous("/pt-br/boards/new"));

        expect(response.status).toBe(TEMPORARY_REDIRECT);
        expect(locationOf(response)).toBe(
            "/pt-br/sign-in?redirect=%2Fpt-br%2Fboards%2Fnew"
        );
    });

    it("carries the query inside the deep link instead of leaving it loose on sign-in", async () => {
        const response = await proxy(
            anonymous("/pt-br/account?tab=billing&plan=price_1")
        );

        expect(locationOf(response)).toBe(
            "/pt-br/sign-in?redirect=%2Fpt-br%2Faccount%3Ftab%3Dbilling%26plan%3Dprice_1"
        );
    });

    it("protects a route nobody listed as public", async () => {
        const response = await proxy(anonymous("/pt-br/brand-new-feature"));

        expect(locationOf(response)).toBe(
            "/pt-br/sign-in?redirect=%2Fpt-br%2Fbrand-new-feature"
        );
    });

    it("lets an anonymous visitor reach the sign-in page", async () => {
        const response = await proxy(anonymous("/pt-br/sign-in"));

        expect(locationOf(response)).toBeNull();
    });

    it("sends an anonymous visitor of a removed public page to sign-in", async () => {
        for (const path of ["/pt-br/sign-up", "/pt-br/forgot-password"]) {
            const response = await proxy(anonymous(path));

            expect(locationOf(response)?.startsWith("/pt-br/sign-in")).toBe(
                true
            );
        }
    });

    it("treats a nested public path as public", async () => {
        const response = await proxy(anonymous("/pt-br/sign-in/recover"));

        expect(locationOf(response)).toBeNull();
    });

    it("does not treat a path that merely starts with a public name as public", async () => {
        const response = await proxy(anonymous("/pt-br/sign-in-internal"));

        expect(locationOf(response)).toBe(
            "/pt-br/sign-in?redirect=%2Fpt-br%2Fsign-in-internal"
        );
    });

    it("lets an anonymous visitor reach the landing at the locale root", async () => {
        for (const path of ["/pt-br", "/pt-br/"]) {
            const response = await proxy(anonymous(path));

            expect(locationOf(response)).toBeNull();
        }
    });

    it("opens only the exact locale root, never what lies under it", async () => {
        for (const [path, redirect] of [
            ["/pt-br/boards", "%2Fpt-br%2Fboards"],
            ["/pt-br//boards", "%2Fpt-br%2F%2Fboards"],
            ["/pt-br/account", "%2Fpt-br%2Faccount"],
        ]) {
            const response = await proxy(anonymous(path));

            expect(locationOf(response)).toBe(
                `/pt-br/sign-in?redirect=${redirect}`
            );
        }
    });

    it("lets a signed-in visitor through an authenticated route", async () => {
        const response = await proxy(signedIn("/pt-br/boards"));

        expect(locationOf(response)).toBeNull();
    });
});

describe("proxy bounce off the public paths", () => {
    it("sends a signed-in visitor to the deep link stored on the way in", async () => {
        const response = await proxy(
            signedIn("/pt-br/sign-in?redirect=%2Fpt-br%2Fboards%2Fnew")
        );

        expect(response.status).toBe(TEMPORARY_REDIRECT);
        expect(locationOf(response)).toBe("/pt-br/boards/new");
    });

    it("keeps the query of the deep link, on the host the request came to", async () => {
        const response = await proxy(
            signedIn(
                "/pt-br/sign-in?redirect=%2Fpt-br%2Faccount%3Ftab%3Dpreferences%26from%3Dmenu"
            )
        );

        expect(response.headers.get("location")).toBe(
            `${ORIGIN}/pt-br/account?tab=preferences&from=menu`
        );
    });

    it("falls back to the boards with no deep link", async () => {
        const response = await proxy(signedIn("/pt-br/sign-in"));

        expect(locationOf(response)).toBe("/pt-br/boards");
    });

    it("sends a signed-in visitor of the landing to the boards", async () => {
        for (const path of ["/pt-br", "/pt-br/"]) {
            const response = await proxy(signedIn(path));

            expect(locationOf(response)).toBe("/pt-br/boards");
        }
    });

    /** Bouncing home would drop the token, and with it the only way to accept. */
    it("refuses a deep link pointing off site", async () => {
        for (const redirect of [
            "https%3A%2F%2Fevil.example.com",
            "%2F%2Fevil.example.com",
            "%2F%5Cevil.example.com",
            "%2Fno-locale%2Fpath",
        ]) {
            const response = await proxy(
                signedIn(`/pt-br/sign-in?redirect=${redirect}`)
            );

            expect(locationOf(response)).toBe("/pt-br/boards");
        }
    });

    it("never lets a backslash in the deep link change the host", async () => {
        const response = await proxy(
            signedIn("/pt-br/sign-in?redirect=%2Fpt-br%2F%5Cevil.example.com")
        );

        expect(response.headers.get("location")?.startsWith(`${ORIGIN}/`)).toBe(
            true
        );
        expect(locationOf(response)?.startsWith("//")).toBe(false);
    });

    it("refuses a deep link whose dot segments resolve to a protocol-relative location", async () => {
        for (const redirect of [
            "%2Fpt-br%2F..%2F%5Cevil.example.com",
            "%2Fpt-br%2F%252e%252e%2F%255cevil.example.com",
            "%2Fpt-br%2F..%2F%09%2Fevil.example.com",
            "%2Fpt-br%2F%2e%2e%2F%5Cevil.example.com",
            "%2Fpt-br%2F..%5C%5Cevil.example.com",
        ]) {
            const response = await proxy(
                signedIn(`/pt-br/sign-in?redirect=${redirect}`)
            );

            expect(locationOf(response)?.startsWith("//")).toBe(false);
            expect(locationOf(response)).toBe("/pt-br/boards");
        }
    });
});

describe("proxy and a session ended from another device", () => {
    it("drops the cookie and serves sign-in instead of bouncing home", async () => {
        sessionCheckMock.mockResolvedValue("revoked");

        const response = await proxy(signedIn("/pt-br/sign-in"));

        expect(locationOf(response)).toBeNull();
        expect(sessionCheckMock).toHaveBeenCalledWith(
            "session-cookie",
            BROWSER_UA
        );
        expect(clearSessionCookieMock).toHaveBeenCalledTimes(1);
    });

    it("still bounces home when the API confirms the session or does not answer", async () => {
        for (const standing of ["active", "unknown"]) {
            sessionCheckMock.mockResolvedValue(standing);

            const response = await proxy(signedIn("/pt-br/sign-in"));

            expect(locationOf(response)).toBe("/pt-br/boards");
        }
        expect(clearSessionCookieMock).not.toHaveBeenCalled();
    });

    it("does not ask the API on an authenticated route or without a cookie", async () => {
        await proxy(signedIn("/pt-br/boards"));
        await proxy(anonymous("/pt-br/sign-in"));

        expect(sessionCheckMock).not.toHaveBeenCalled();
    });
});

describe("proxy forwarded headers", () => {
    it("still stores the locale cookie when it forwards the request headers", async () => {
        const response = await proxy(signedIn("/pt-br/boards"));

        expect(cookieSetMock).toHaveBeenCalledWith(
            "x-locale",
            "pt-br",
            localeCookieOptions(false)
        );
        expect(response.headers.get("x-middleware-override-headers")).toContain(
            LOCALE_REQUEST_HEADER
        );
    });
});
