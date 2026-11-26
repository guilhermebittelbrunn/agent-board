import {
    checkRateLimit,
    type RateLimitBlockReason,
    type RateLimitBudget,
} from "@repo/security";
import {
    applySecurityHeaders,
    buildApiOptions,
} from "@repo/security/middleware";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import {
    generateRequestId,
    REQUEST_ID_HEADER,
} from "@repo/shared/utils/helpers/request-id";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    isUnprovenCookieWrite,
    MUTATING_METHODS,
} from "@/(shared)/lib/cookie-write-origin";
import {
    buildCorsHeaders,
    isOriginAllowed,
    resolveAllowedOrigins,
} from "@/(shared)/lib/cors";
import { rateLimitSubject } from "@/(shared)/lib/rate-limit-subject";
import { env } from "@/env";

const NO_CONTENT = 204;

const allowedOrigins = resolveAllowedOrigins(
    env.CORS_ORIGIN,
    process.env.NODE_ENV === "production"
);

const securityOptions = buildApiOptions();

/**
 * Two budgets. Every POST/PUT/PATCH/DELETE counts in the standard one (60 a minute per
 * address and actor), so a new mutating endpoint is limited without being listed here.
 * The paths below count in the strict one instead (20 a minute per address), never in
 * both: each spends the project's Identity Toolkit quota or writes billed storage.
 *
 * The sign-in endpoints have no guard to hang a budget on. `/auth/me` is authenticated
 * and on the hot path, so it stays off: GETs only count when listed here.
 *
 * `/files` is the exception that is authenticated: a guard is no budget when the caller
 * is a legitimate user in a loop, and every accepted request writes to the bucket and is
 * billed as storage and egress. Changing the password spends Identity Toolkit quota on
 * each attempt.
 *
 * `/runner/register` has no guard either: the one-time code is the credential, so the
 * strict budget is what keeps guessing it slow.
 *
 * Matched exactly: a neighbour of a listed path falls back to the standard budget.
 */
const STRICT_RATE_LIMITED_PATHS = [
    "/auth/sign-in",
    "/auth/sign-in/github",
    "/files",
    "/account/password",
    "/runner/register",
];

function rateLimitBudgetFor(request: NextRequest): RateLimitBudget | null {
    const { pathname } = request.nextUrl;
    if (STRICT_RATE_LIMITED_PATHS.includes(pathname)) {
        return "strict";
    }
    return MUTATING_METHODS.has(request.method) ? "standard" : null;
}

type OriginRefusalReason = "origin" | "missing-origin";

/** Single line, stable prefix, no address, header or body: blocking is not a reason to start retaining personal data. */
function logBlocked(
    reason: RateLimitBlockReason | OriginRefusalReason,
    request: NextRequest,
    requestId: string
): void {
    logEvent("security", "blocked", {
        reason,
        path: request.nextUrl.pathname,
        method: request.method,
        requestId,
    });
}

function withRequestId<T extends Response>(response: T, requestId: string): T {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
}

function withSecurityHeaders<T extends Response>(response: T): T {
    return applySecurityHeaders(response, securityOptions, { noIndex: true });
}

function withCors<T extends Response>(response: T, origin: string | null): T {
    for (const [name, value] of Object.entries(buildCorsHeaders(origin))) {
        response.headers.set(name, value);
    }
    return response;
}

function refuseOrigin(
    request: NextRequest,
    requestId: string,
    reason: OriginRefusalReason = "origin"
): NextResponse {
    logBlocked(reason, request, requestId);

    // A preflight has no body the browser would read; withholding
    // `Access-Control-Allow-Origin` is itself the refusal.
    if (request.method === "OPTIONS") {
        return new NextResponse(null, { status: NO_CONTENT });
    }

    return NextResponse.json(
        { error: { code: "AUTH_FORBIDDEN_ORIGIN" } },
        { status: HTTP_STATUS.FORBIDDEN }
    );
}

function refuseRateLimit(retryAfterSeconds: number | null): NextResponse {
    const response = NextResponse.json(
        { error: { code: "AUTH_RATE_LIMITED" } },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS }
    );

    if (retryAfterSeconds !== null) {
        response.headers.set("Retry-After", String(retryAfterSeconds));
    }

    return response;
}

export async function proxy(request: NextRequest) {
    // Always generated here, never read from the caller: honouring an inbound value
    // would let a client forge log lines under an identifier of its choosing.
    const requestId = generateRequestId();
    const origin = request.headers.get("origin");

    if (!isOriginAllowed(origin, allowedOrigins)) {
        return withRequestId(
            withSecurityHeaders(
                withCors(refuseOrigin(request, requestId), null)
            ),
            requestId
        );
    }

    if (isUnprovenCookieWrite(request)) {
        return withRequestId(
            withSecurityHeaders(
                withCors(
                    refuseOrigin(request, requestId, "missing-origin"),
                    null
                )
            ),
            requestId
        );
    }

    if (request.method === "OPTIONS") {
        return withRequestId(
            withSecurityHeaders(
                withCors(new NextResponse(null, { status: NO_CONTENT }), origin)
            ),
            requestId
        );
    }

    const budget = rateLimitBudgetFor(request);
    if (budget) {
        const decision = await checkRateLimit(request, {
            budget,
            subject:
                budget === "standard"
                    ? await rateLimitSubject(request)
                    : undefined,
        });

        if (!decision.allowed) {
            logBlocked(decision.reason, request, requestId);
            return withRequestId(
                withSecurityHeaders(
                    withCors(
                        refuseRateLimit(decision.retryAfterSeconds),
                        origin
                    )
                ),
                requestId
            );
        }
    }

    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set(REQUEST_ID_HEADER, requestId);

    return withRequestId(
        withSecurityHeaders(
            withCors(
                NextResponse.next({ request: { headers: forwardedHeaders } }),
                origin
            )
        ),
        requestId
    );
}

export const config = {
    matcher: "/:path*",
};
