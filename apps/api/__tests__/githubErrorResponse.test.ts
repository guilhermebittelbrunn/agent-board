import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { describe, expect, it } from "vitest";
import {
    GithubApiError,
    type GithubApiErrorKind,
    githubAppNotConfiguredResponse,
    githubErrorResponse,
} from "@/(shared)/lib/github/github-errors";

describe("githubErrorResponse", () => {
    it.each<[GithubApiErrorKind, number, string]>([
        [
            "not_found",
            HTTP_STATUS.NOT_FOUND,
            "GITHUB_REPOSITORY_NOT_ACCESSIBLE",
        ],
        [
            "rate_limited",
            HTTP_STATUS.SERVICE_UNAVAILABLE,
            "GITHUB_RATE_LIMITED",
        ],
        ["credentials_rejected", HTTP_STATUS.BAD_GATEWAY, "GITHUB_UNAVAILABLE"],
        ["unavailable", HTTP_STATUS.BAD_GATEWAY, "GITHUB_UNAVAILABLE"],
        [
            "permission_denied",
            HTTP_STATUS.SERVICE_UNAVAILABLE,
            "GITHUB_APP_PERMISSION_MISSING",
        ],
        [
            "unprocessable",
            HTTP_STATUS.UNPROCESSABLE_ENTITY,
            "GITHUB_PULL_REQUEST_REJECTED",
        ],
    ])("answers %s with %i %s", async (kind, status, code) => {
        const response = githubErrorResponse(
            new GithubApiError(kind, HTTP_STATUS.INTERNAL_SERVER_ERROR)
        );

        expect(response?.status).toBe(status);
        expect(await response?.json()).toEqual({ error: { code } });
    });

    it("leaves any other error to the caller", () => {
        expect(githubErrorResponse(new Error("boom"))).toBeNull();
    });

    it("answers a missing App with 503 GITHUB_APP_NOT_CONFIGURED", async () => {
        const response = githubAppNotConfiguredResponse();

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await response.json()).toEqual({
            error: { code: "GITHUB_APP_NOT_CONFIGURED" },
        });
    });
});
