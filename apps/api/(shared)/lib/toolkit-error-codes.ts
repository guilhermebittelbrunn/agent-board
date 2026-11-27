import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";

/**
 * Maps a re-authentication failure to a stable code. Every credential rejection collapses
 * into the caller's fallback because the toolkit deliberately does not distinguish a wrong
 * password from an unknown account.
 */
export function mapPasswordCheckMessageToCode(
    message: string,
    fallback: string
): string {
    const m = message.toUpperCase();
    if (m.includes("TOO_MANY_ATTEMPTS") || m.includes("TOO_MANY_REQUESTS")) {
        return "USERS_AUTH_RATE_LIMITED";
    }
    if (m.includes("WEAK_PASSWORD")) {
        return "USERS_AUTH_WEAK_PASSWORD";
    }
    return fallback;
}

function adminErrorCodeOf(error: unknown): string | undefined {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "string" ? code : undefined;
}

/**
 * What a log line may say about an Admin SDK failure: the provider code
 * (`auth/internal-error`) or the error name. Never the message, which can echo the address.
 */
export function adminAuthErrorReason(error: unknown): string {
    return (
        adminErrorCodeOf(error) ??
        (error instanceof Error ? error.name : "unknown")
    );
}

export function statusForAuthErrorCode(code: string): number {
    return code === "USERS_AUTH_RATE_LIMITED"
        ? HTTP_STATUS.TOO_MANY_REQUESTS
        : HTTP_STATUS.BAD_REQUEST;
}
