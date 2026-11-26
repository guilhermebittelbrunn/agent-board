// @vitest-environment node

import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildCorsHeaders,
    isOriginAllowed,
    parseAllowedOrigins,
    resolveAllowedOrigins,
} from "@/(shared)/lib/cors";

const HASHED_SUBJECT = /^[0-9a-f]{32}$/;
const { envMock, checkRateLimitMock, warnMock } = vi.hoisted(() => ({
    envMock: { CORS_ORIGIN: undefined as string | undefined },
    checkRateLimitMock: vi.fn(),
    warnMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: envMock }));

vi.mock("@repo/security", () => ({
    checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

const APP_ORIGIN = "http://localhost:3000";
const SECOND_ORIGIN = "http://localhost:3001";
const FOREIGN_ORIGIN = "https://evil.example";
const OK = 200;
const NO_CONTENT = 204;
const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const RETRY_AFTER_SECONDS = 43;
const ORIGIN_REFUSAL_LINE =
    /^\[security] blocked reason=origin path=\/entities method=GET requestId=[0-9a-f-]{36}$/;
const MISSING_ORIGIN_REFUSAL_LINE =
    /^\[security] blocked reason=missing-origin path=\/entities method=POST requestId=[0-9a-f-]{36}$/;
const REQUEST_ID = /^[0-9a-f-]{36}$/;
const SESSION_COOKIE = { "access-token": "session-cookie-value" };
const RATE_LIMIT_REFUSAL_LINE =
    /^\[security] blocked reason=rate-limit path=\/auth\/sign-in method=POST requestId=[0-9a-f-]{36}$/;

type ProxyRequestOptions = {
    origin?: string;
    method?: string;
    path?: string;
    authorization?: string;
    cookies?: Record<string, string>;
    secFetchSite?: string;
};

function makeRequest({
    origin,
    method = "GET",
    path = "/entities",
    authorization,
    cookies = {},
    secFetchSite,
}: ProxyRequestOptions = {}): NextRequest {
    const headers = new Headers();
    if (origin) {
        headers.set("origin", origin);
    }
    if (authorization) {
        headers.set("authorization", authorization);
    }
    if (secFetchSite) {
        headers.set("sec-fetch-site", secFetchSite);
    }
    const cookieHeader = Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    if (cookieHeader) {
        headers.set("cookie", cookieHeader);
    }

    return {
        method,
        headers,
        cookies: { has: (name: string) => name in cookies },
        url: `http://localhost:3002${path}`,
        nextUrl: { pathname: path },
    } as unknown as NextRequest;
}

async function loadProxy(corsOrigin: string | undefined) {
    envMock.CORS_ORIGIN = corsOrigin;
    vi.resetModules();
    const proxyModule = await import("@/proxy");
    return proxyModule.proxy;
}

function budgetsSpent(): unknown[] {
    return checkRateLimitMock.mock.calls.map(
        ([, options]) => (options as { budget?: string } | undefined)?.budget
    );
}

function unsignedJwt(sub: string): string {
    const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "RS256" })}.${encode({ sub })}.signature`;
}

beforeEach(() => {
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue({ allowed: true, enforced: false });
    warnMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(warnMock);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("allowed origin list", () => {
    it("reads a comma-separated list, tolerating spacing and stray commas", () => {
        expect(
            parseAllowedOrigins(` ${APP_ORIGIN} , ${SECOND_ORIGIN} , `)
        ).toEqual([APP_ORIGIN, SECOND_ORIGIN]);
    });

    it("has no origin at all when production leaves it unset", () => {
        expect(resolveAllowedOrigins(undefined, true)).toEqual([]);
        expect(resolveAllowedOrigins("", true)).toEqual([]);
    });

    it("falls back to the local panel outside production", () => {
        expect(resolveAllowedOrigins(undefined, false)).toEqual([APP_ORIGIN]);
    });

    it("treats a missing origin header as a server-to-server call", () => {
        expect(isOriginAllowed(null, [])).toBe(true);
        expect(isOriginAllowed(FOREIGN_ORIGIN, [APP_ORIGIN])).toBe(false);
        expect(isOriginAllowed(APP_ORIGIN, [APP_ORIGIN])).toBe(true);
    });

    it("echoes the validated origin and varies the cache on it", () => {
        const headers = buildCorsHeaders(APP_ORIGIN);

        expect(headers["Access-Control-Allow-Origin"]).toBe(APP_ORIGIN);
        expect(headers.Vary).toBe("Origin");
    });

    it("lets the caller read the wait that comes with a refusal", () => {
        expect(
            buildCorsHeaders(APP_ORIGIN)["Access-Control-Expose-Headers"]
        ).toContain("Retry-After");
    });

    it("grants nothing when there is no origin to answer, but still varies", () => {
        expect(buildCorsHeaders(null)).toEqual({ Vary: "Origin" });
    });
});

describe("api proxy origin decision", () => {
    it("lets a server-to-server call through without CORS headers", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(makeRequest());

        expect(response.status).toBe(OK);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("answers an allowlisted origin with that exact origin", async () => {
        const proxy = await loadProxy(`${APP_ORIGIN},${SECOND_ORIGIN}`);

        const response = await proxy(makeRequest({ origin: SECOND_ORIGIN }));

        expect(response.headers.get("access-control-allow-origin")).toBe(
            SECOND_ORIGIN
        );
        expect(response.headers.get("vary")).toBe("Origin");
    });

    it("refuses an origin outside the allowlist with a stable error code", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(makeRequest({ origin: FOREIGN_ORIGIN }));

        expect(response.status).toBe(FORBIDDEN);
        await expect(response.json()).resolves.toEqual({
            error: { code: "AUTH_FORBIDDEN_ORIGIN" },
        });
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("answers an allowed preflight with the CORS headers", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({ origin: APP_ORIGIN, method: "OPTIONS" })
        );

        expect(response.status).toBe(NO_CONTENT);
        expect(response.headers.get("access-control-allow-origin")).toBe(
            APP_ORIGIN
        );
        expect(response.headers.get("access-control-allow-methods")).toContain(
            "PATCH"
        );
    });

    it("answers a refused preflight without permission to proceed", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({ origin: FOREIGN_ORIGIN, method: "OPTIONS" })
        );

        expect(response.status).toBe(NO_CONTENT);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("never answers with a wildcard, whatever the configuration", async () => {
        vi.stubEnv("NODE_ENV", "development");
        const proxy = await loadProxy(undefined);

        for (const origin of [APP_ORIGIN]) {
            const response = await proxy(makeRequest({ origin }));

            expect(response.headers.get("access-control-allow-origin")).toBe(
                origin
            );
            expect(
                response.headers.get("access-control-allow-origin")
            ).not.toBe("*");
        }
    });

    it("varies the cache on origin even when it grants nothing", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const refused = await proxy(makeRequest({ origin: FOREIGN_ORIGIN }));
        const originless = await proxy(makeRequest());

        expect(refused.headers.get("vary")).toBe("Origin");
        expect(originless.headers.get("vary")).toBe("Origin");
    });

    it("never lets a cross-origin caller send credentials", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(makeRequest({ origin: APP_ORIGIN }));

        expect(
            response.headers.get("access-control-allow-credentials")
        ).toBeNull();
    });

    it("records the refusal without any personal data", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(makeRequest({ origin: FOREIGN_ORIGIN }));

        expect(warnMock).toHaveBeenCalledWith(
            expect.stringMatching(ORIGIN_REFUSAL_LINE)
        );
    });
});

describe("api proxy write carried only by the session cookie", () => {
    it("refuses a cookie-carried write without Origin before the guard and the rate limit", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({ method: "POST", cookies: SESSION_COOKIE })
        );

        expect(response.status).toBe(FORBIDDEN);
        await expect(response.json()).resolves.toEqual({
            error: { code: "AUTH_FORBIDDEN_ORIGIN" },
        });
        expect(response.headers.get("vary")).toBe("Origin");
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("x-request-id")).toMatch(REQUEST_ID);
        expect(checkRateLimitMock).not.toHaveBeenCalled();
    });

    it("records the refusal as missing-origin without the cookie", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(makeRequest({ method: "POST", cookies: SESSION_COOKIE }));

        expect(warnMock).toHaveBeenCalledTimes(1);
        expect(warnMock).toHaveBeenCalledWith(
            expect.stringMatching(MISSING_ORIGIN_REFUSAL_LINE)
        );
        expect(String(warnMock.mock.calls[0]?.[0])).not.toContain(
            "session-cookie-value"
        );
    });

    it("refuses every mutating method", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const response = await proxy(
                makeRequest({ method, cookies: SESSION_COOKIE })
            );

            expect(response.status).toBe(FORBIDDEN);
        }
    });

    it("lets the same write through with a bearer token", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({
                method: "POST",
                cookies: SESSION_COOKIE,
                authorization: "Bearer token",
            })
        );

        expect(response.status).toBe(OK);
    });

    it("lets the same write through from an allowlisted origin", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({
                method: "POST",
                cookies: SESSION_COOKIE,
                origin: APP_ORIGIN,
            })
        );

        expect(response.status).toBe(OK);
    });

    it("lets the same write through when the browser marks it same-origin", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({
                method: "POST",
                cookies: SESSION_COOKIE,
                secFetchSite: "same-origin",
            })
        );

        expect(response.status).toBe(OK);
    });

    it("still refuses when the browser marks it cross-site", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({
                method: "POST",
                cookies: SESSION_COOKIE,
                secFetchSite: "cross-site",
            })
        );

        expect(response.status).toBe(FORBIDDEN);
    });

    it("lets a GET carrying the cookie through without Origin", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(makeRequest({ cookies: SESSION_COOKIE }));

        expect(response.status).toBe(OK);
    });

    it("lets an anonymous write without Origin through, like a server-to-server call", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const write = await proxy(makeRequest({ method: "POST" }));

        expect(write.status).toBe(OK);
    });

    it("ignores cookies other than the session one", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({ method: "POST", cookies: { "x-locale": "en" } })
        );

        expect(response.status).toBe(OK);
    });
});

describe("api proxy security headers", () => {
    it("hardens every response it lets through", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(makeRequest({ origin: APP_ORIGIN }));

        expect(response.headers.get("content-security-policy")).toContain(
            "default-src 'none'"
        );
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("strict-transport-security")).toContain(
            "max-age="
        );
    });

    it("hardens the responses it refuses too", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(makeRequest({ origin: FOREIGN_ORIGIN }));

        expect(response.headers.get("content-security-policy")).toContain(
            "frame-ancestors 'none'"
        );
    });
});

describe("api proxy rate limit", () => {
    it("leaves authenticated traffic alone", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        for (const path of ["/auth/me", "/health"]) {
            await proxy(makeRequest({ origin: APP_ORIGIN, path }));
        }

        expect(checkRateLimitMock).not.toHaveBeenCalled();
    });

    it("counts the public authentication endpoints", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        const publicAuthPaths = ["/auth/sign-in", "/auth/sign-in/github"];

        for (const path of publicAuthPaths) {
            await proxy(
                makeRequest({ origin: APP_ORIGIN, method: "POST", path })
            );
        }

        expect(budgetsSpent()).toEqual(publicAuthPaths.map(() => "strict"));
    });

    it("counts changing the password in the strict budget", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        const passwordPaths = ["/account/password"];

        for (const path of passwordPaths) {
            await proxy(
                makeRequest({ origin: APP_ORIGIN, method: "POST", path })
            );
        }

        expect(budgetsSpent()).toEqual(passwordPaths.map(() => "strict"));
    });

    it("counts runner registration in the strict budget and its polling in the standard one", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(makeRequest({ method: "POST", path: "/runner/register" }));
        await proxy(makeRequest({ method: "POST", path: "/runner/claim" }));

        expect(budgetsSpent()).toEqual(["strict", "standard"]);
    });

    it("counts the rest of the account area in the standard budget", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        const accountPaths = ["/account", "/account/", "/account/password/x"];

        for (const path of accountPaths) {
            await proxy(
                makeRequest({ origin: APP_ORIGIN, method: "PATCH", path })
            );
        }

        expect(budgetsSpent()).toEqual(accountPaths.map(() => "standard"));
    });

    it("answers a spent budget with the code and the wait", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        checkRateLimitMock.mockResolvedValue({
            allowed: false,
            reason: "rate-limit",
            retryAfterSeconds: RETRY_AFTER_SECONDS,
        });

        const response = await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/auth/sign-in",
            })
        );

        expect(response.status).toBe(TOO_MANY_REQUESTS);
        expect(response.headers.get("retry-after")).toBe(
            String(RETRY_AFTER_SECONDS)
        );
        expect(response.headers.get("access-control-allow-origin")).toBe(
            APP_ORIGIN
        );
        await expect(response.json()).resolves.toEqual({
            error: { code: "AUTH_RATE_LIMITED" },
        });
    });

    it.each(["/account/email", "/auth/email-change/confirm", "/contact"])(
        "answers a spent budget on %s with AUTH_RATE_LIMITED",
        async (path) => {
            const proxy = await loadProxy(APP_ORIGIN);
            checkRateLimitMock.mockResolvedValue({
                allowed: false,
                reason: "rate-limit",
                retryAfterSeconds: RETRY_AFTER_SECONDS,
            });

            const response = await proxy(
                makeRequest({ origin: APP_ORIGIN, method: "POST", path })
            );

            expect(response.status).toBe(TOO_MANY_REQUESTS);
            await expect(response.json()).resolves.toEqual({
                error: { code: "AUTH_RATE_LIMITED" },
            });
        }
    );

    /**
     * A browser hides every response header from cross-origin scripts unless the
     * server names it, and `Retry-After` is not on the safelist that is exempt.
     */
    it("lets the cross-origin caller read the wait it just sent", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        checkRateLimitMock.mockResolvedValue({
            allowed: false,
            reason: "rate-limit",
            retryAfterSeconds: RETRY_AFTER_SECONDS,
        });

        const response = await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/auth/sign-in",
            })
        );
        const exposed = (
            response.headers.get("access-control-expose-headers") ?? ""
        )
            .split(",")
            .map((name) => name.trim().toLowerCase());

        expect(response.headers.get("retry-after")).toBe(
            String(RETRY_AFTER_SECONDS)
        );
        expect(exposed).toContain("retry-after");
    });

    it("hardens a refused burst like any other response", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        checkRateLimitMock.mockResolvedValue({
            allowed: false,
            reason: "rate-limit",
            retryAfterSeconds: RETRY_AFTER_SECONDS,
        });

        const response = await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/auth/sign-in",
            })
        );

        expect(response.headers.get("content-security-policy")).toContain(
            "default-src 'none'"
        );
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("vary")).toBe("Origin");
    });

    it("records the spent budget without any personal data", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        checkRateLimitMock.mockResolvedValue({
            allowed: false,
            reason: "rate-limit",
            retryAfterSeconds: RETRY_AFTER_SECONDS,
        });

        await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/auth/sign-in",
            })
        );

        expect(warnMock).toHaveBeenCalledWith(
            expect.stringMatching(RATE_LIMIT_REFUSAL_LINE)
        );
    });

    /**
     * The strict budget is spent on an exact pathname, so a sibling route under the same
     * prefix falls back to the standard one. That is the price of never charging
     * `/auth/sign-in/github` twice for a single request.
     */
    it("counts the neighbours of a strict path in the standard budget", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        const neighbours = [
            "/auth/sign-in/",
            "/auth/sign-in/apple",
            "/auth/sign-in-again",
        ];

        for (const path of neighbours) {
            await proxy(
                makeRequest({ origin: APP_ORIGIN, method: "POST", path })
            );
        }

        expect(budgetsSpent()).toEqual(neighbours.map(() => "standard"));
    });

    it("limits a mutating route nobody listed, and answers 429 when spent", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        checkRateLimitMock.mockResolvedValue({
            allowed: false,
            reason: "rate-limit",
            retryAfterSeconds: RETRY_AFTER_SECONDS,
        });

        const response = await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/a-route-that-does-not-exist",
            })
        );

        expect(budgetsSpent()).toEqual(["standard"]);
        expect(response.status).toBe(TOO_MANY_REQUESTS);
        expect(response.headers.get("retry-after")).toBe(
            String(RETRY_AFTER_SECONDS)
        );
        await expect(response.json()).resolves.toEqual({
            error: { code: "AUTH_RATE_LIMITED" },
        });
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])(
        "counts %s in the standard budget",
        async (method) => {
            const proxy = await loadProxy(APP_ORIGIN);

            await proxy(
                makeRequest({ origin: APP_ORIGIN, method, path: "/entities/1" })
            );

            expect(budgetsSpent()).toEqual(["standard"]);
        }
    );

    it("leaves reads off both budgets", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        for (const method of ["GET", "HEAD"]) {
            await proxy(
                makeRequest({ origin: APP_ORIGIN, method, path: "/entities" })
            );
        }

        expect(checkRateLimitMock).not.toHaveBeenCalled();
    });

    it("spends a single budget on a strict path", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/account/password",
                authorization: `Bearer ${unsignedJwt("uid-1")}`,
            })
        );

        expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
        expect(checkRateLimitMock.mock.calls[0][1]).toEqual({
            budget: "strict",
            subject: undefined,
        });
    });

    it("keys the standard budget by a hash of the bearer subject", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/notifications/read-all",
                authorization: `Bearer ${unsignedJwt("uid-1")}`,
            })
        );

        const [, options] = checkRateLimitMock.mock.calls[0] as [
            unknown,
            { budget: string; subject: string },
        ];
        expect(options.budget).toBe("standard");
        expect(options.subject).toMatch(HASHED_SUBJECT);
        expect(options.subject).not.toContain("uid-1");
    });

    it("counts signing out in the standard budget, keyed by the forwarded session subject", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(
            makeRequest({
                method: "DELETE",
                path: "/auth/session",
                authorization: `Bearer ${unsignedJwt("uid-1")}`,
            })
        );
        await proxy(
            makeRequest({
                method: "DELETE",
                path: "/auth/session",
                authorization: `Bearer ${unsignedJwt("uid-2")}`,
            })
        );
        await proxy(makeRequest({ method: "GET", path: "/auth/session" }));

        expect(checkRateLimitMock).toHaveBeenCalledTimes(2);
        const [firstOptions, secondOptions] = checkRateLimitMock.mock.calls.map(
            ([, options]) => options as { budget: string; subject: string }
        );
        expect(firstOptions.budget).toBe("standard");
        expect(secondOptions.budget).toBe("standard");
        expect(firstOptions.subject).toMatch(HASHED_SUBJECT);
        expect(secondOptions.subject).toMatch(HASHED_SUBJECT);
        expect(firstOptions.subject).not.toBe(secondOptions.subject);
    });

    it("omits the wait when the refusal carries none", async () => {
        const proxy = await loadProxy(APP_ORIGIN);
        checkRateLimitMock.mockResolvedValue({
            allowed: false,
            reason: "bot",
            retryAfterSeconds: null,
        });

        const response = await proxy(
            makeRequest({
                origin: APP_ORIGIN,
                method: "POST",
                path: "/auth/sign-up",
            })
        );

        expect(response.status).toBe(TOO_MANY_REQUESTS);
        expect(response.headers.get("retry-after")).toBeNull();
    });

    it("refuses a foreign origin before spending a rate limit call", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(
            makeRequest({
                origin: FOREIGN_ORIGIN,
                method: "POST",
                path: "/auth/sign-in",
            })
        );

        expect(checkRateLimitMock).not.toHaveBeenCalled();
    });
});

describe("agent endpoints behind the proxy", () => {
    const RUN_SECRET_LENGTH = 43;
    const runToken = (runId: string, secretChar: string) =>
        `Bearer kbr_${runId}_${secretChar.repeat(RUN_SECRET_LENGTH)}`;

    function subjectsSpent(): unknown[] {
        return checkRateLimitMock.mock.calls.map(
            ([, options]) =>
                (options as { subject?: string } | undefined)?.subject
        );
    }

    it("refuses a foreign origin on /mcp even with a run token, before any rate limit call", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        const response = await proxy(
            makeRequest({
                origin: FOREIGN_ORIGIN,
                method: "POST",
                path: "/mcp",
                authorization: runToken("run1", "A"),
            })
        );

        expect(response.status).toBe(FORBIDDEN);
        expect(await response.json()).toEqual({
            error: { code: "AUTH_FORBIDDEN_ORIGIN" },
        });
        expect(checkRateLimitMock).not.toHaveBeenCalled();
    });

    it("lets an agent call without an origin reach /mcp and /agent/tools", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        for (const path of ["/mcp", "/agent/tools/get_card"]) {
            const response = await proxy(
                makeRequest({
                    method: "POST",
                    path,
                    authorization: runToken("run1", "A"),
                })
            );

            expect(response.headers.get("x-middleware-next")).toBe("1");
        }
        expect(budgetsSpent()).toEqual(["standard", "standard"]);
    });

    it("spends one bucket per run, whatever the secret, apart from anonymous callers", async () => {
        const proxy = await loadProxy(APP_ORIGIN);

        await proxy(
            makeRequest({
                method: "POST",
                path: "/mcp",
                authorization: runToken("run1", "A"),
            })
        );
        await proxy(
            makeRequest({
                method: "POST",
                path: "/mcp",
                authorization: runToken("run1", "B"),
            })
        );
        await proxy(
            makeRequest({
                method: "POST",
                path: "/mcp",
                authorization: runToken("run2", "A"),
            })
        );
        await proxy(makeRequest({ method: "POST", path: "/mcp" }));

        const [first, sameRun, otherRun, anonymous] = subjectsSpent();
        expect(first).toMatch(HASHED_SUBJECT);
        expect(sameRun).toBe(first);
        expect(otherRun).not.toBe(first);
        expect(anonymous).not.toBe(first);
    });
});
