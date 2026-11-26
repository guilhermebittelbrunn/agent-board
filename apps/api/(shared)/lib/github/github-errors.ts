import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";

export type GithubApiErrorKind =
    | "not_found"
    | "rate_limited"
    | "credentials_rejected"
    | "unavailable";

export class GithubApiError extends Error {
    readonly kind: GithubApiErrorKind;
    readonly status: number | null;

    constructor(kind: GithubApiErrorKind, status: number | null = null) {
        super(`GitHub API ${kind}`);
        this.name = "GithubApiError";
        this.kind = kind;
        this.status = status;
    }
}

/**
 * The quota that ran out is the board's, not the caller's, so it is a 503 and not the
 * 429 the panel reads as "you are going too fast". A rejected App credential answers like
 * an outage: the caller has nothing to fix, and the key itself is not their business.
 */
const RESPONSES: Record<GithubApiErrorKind, { code: string; status: number }> =
    {
        not_found: {
            code: "GITHUB_REPOSITORY_NOT_ACCESSIBLE",
            status: HTTP_STATUS.NOT_FOUND,
        },
        rate_limited: {
            code: "GITHUB_RATE_LIMITED",
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        },
        credentials_rejected: {
            code: "GITHUB_UNAVAILABLE",
            status: HTTP_STATUS.BAD_GATEWAY,
        },
        unavailable: {
            code: "GITHUB_UNAVAILABLE",
            status: HTTP_STATUS.BAD_GATEWAY,
        },
    };

export function githubErrorResponse(error: unknown): Response | null {
    if (!(error instanceof GithubApiError)) {
        return null;
    }
    const { code, status } = RESPONSES[error.kind];
    return Response.json({ error: { code } }, { status });
}

export const githubAppNotConfiguredResponse = (): Response =>
    Response.json(
        { error: { code: "GITHUB_APP_NOT_CONFIGURED" } },
        { status: HTTP_STATUS.SERVICE_UNAVAILABLE }
    );
