import { createHmac } from "node:crypto";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type MockInstance,
    vi,
} from "vitest";

const { envMock, invalidateRepositoryMock, handlePullRequestMock } = vi.hoisted(
    () => ({
        envMock: { GITHUB_WEBHOOK_SECRET: undefined as string | undefined },
        invalidateRepositoryMock: vi.fn(),
        handlePullRequestMock: vi.fn(),
    })
);

vi.mock("@/(shared)/lib/pull-request/pull-request-webhook", () => ({
    isPullRequestWebhook: (event: string) =>
        [
            "pull_request",
            "pull_request_review",
            "issue_comment",
            "check_suite",
        ].includes(event),
    handlePullRequestWebhook: handlePullRequestMock,
}));

vi.mock("@/env", () => ({ env: envMock }));

vi.mock("@/(shared)/lib/github/github-permission-cache", () => ({
    githubPermissionCache: {
        get: vi.fn(),
        set: vi.fn(),
        invalidateRepository: invalidateRepositoryMock,
    },
}));

const { POST } = await import("@/app/(routes)/github/webhook/route");

const SECRET = "test-webhook-secret";
const ONE_MIB = 1_048_576;
const URL = "http://api.test/github/webhook";

function delivery(
    event: string,
    body: string | Buffer,
    { secret = SECRET, signature }: { secret?: string; signature?: string } = {}
): Request {
    const bytes = typeof body === "string" ? Buffer.from(body) : body;
    return new Request(URL, {
        method: "POST",
        body: new Uint8Array(bytes),
        headers: {
            "content-type": "application/json",
            "x-github-event": event,
            "x-github-delivery": "delivery-1",
            "x-hub-signature-256":
                signature ??
                `sha256=${createHmac("sha256", secret).update(bytes).digest("hex")}`,
        },
    });
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
    envMock.GITHUB_WEBHOOK_SECRET = SECRET;
    invalidateRepositoryMock.mockReset();
    handlePullRequestMock.mockReset();
    handlePullRequestMock.mockResolvedValue({ ok: true, handled: false });
    warn = vi.spyOn(console, "warn").mockImplementation(() => {
        // asserted where it matters
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("POST /github/webhook", () => {
    it("answers 503 GITHUB_APP_NOT_CONFIGURED without a secret", async () => {
        envMock.GITHUB_WEBHOOK_SECRET = undefined;

        const response = await POST(delivery("ping", "{}"));

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await response.json()).toEqual({
            error: { code: "GITHUB_APP_NOT_CONFIGURED" },
        });
    });

    it("answers 413 above 1 MiB", async () => {
        const response = await POST(
            delivery("ping", Buffer.alloc(ONE_MIB + 1, " "))
        );

        expect(response.status).toBe(HTTP_STATUS.PAYLOAD_TOO_LARGE);
        expect(await response.json()).toEqual({
            error: { code: "GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE" },
        });
    });

    it.each([
        ["a signature from another secret", { secret: "another" }],
        ["a missing signature", { signature: "" }],
        ["a malformed signature", { signature: "sha256=nothex" }],
    ])("answers 401 for %s", async (_case, options) => {
        const response = await POST(delivery("member", "{}", options));

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(await response.json()).toEqual({
            error: { code: "GITHUB_WEBHOOK_SIGNATURE_INVALID" },
        });
        expect(invalidateRepositoryMock).not.toHaveBeenCalled();
    });

    it("answers 400 for broken JSON that is correctly signed", async () => {
        const response = await POST(delivery("member", "{not json"));

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await response.json()).toEqual({
            error: { code: "GITHUB_WEBHOOK_PAYLOAD_INVALID" },
        });
    });

    it("answers 400 for a handled event with an unexpected shape", async () => {
        const response = await POST(
            delivery("member", JSON.stringify({ action: "added" }))
        );

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(invalidateRepositoryMock).not.toHaveBeenCalled();
    });

    it("invalidates the repository of a member event", async () => {
        const response = await POST(
            delivery(
                "member",
                JSON.stringify({
                    action: "added",
                    member: { login: "octocat" },
                    repository: { full_name: "agent-board-demo/sample-app" },
                })
            )
        );

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(await response.json()).toEqual({ data: { handled: true } });
        expect(invalidateRepositoryMock).toHaveBeenCalledExactlyOnceWith(
            "agent-board-demo/sample-app"
        );
        expect(warn).toHaveBeenCalledWith(
            "[github] webhook-received event=member delivery=delivery-1 action=added handled=true"
        );
    });

    it("invalidates every repository added to or removed from the installation", async () => {
        const response = await POST(
            delivery(
                "installation_repositories",
                JSON.stringify({
                    action: "removed",
                    repositories_added: [{ full_name: "octo/a" }],
                    repositories_removed: [
                        { full_name: "octo/b" },
                        { full_name: "octo/c" },
                    ],
                })
            )
        );

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(invalidateRepositoryMock.mock.calls).toEqual([
            ["octo/a"],
            ["octo/b"],
            ["octo/c"],
        ]);
    });

    it.each(["ping", "pull_request"])(
        "acknowledges %s without touching the cache",
        async (event) => {
            const response = await POST(
                delivery(event, JSON.stringify({ zen: "Keep it simple." }))
            );

            expect(response.status).toBe(HTTP_STATUS.OK);
            expect(await response.json()).toEqual({ data: { handled: false } });
            expect(invalidateRepositoryMock).not.toHaveBeenCalled();
        }
    );

    it("never writes the body or the secret to the log", async () => {
        await POST(
            delivery(
                "member",
                JSON.stringify({
                    action: "added",
                    repository: { full_name: "octo/private-name" },
                })
            )
        );

        const logged = JSON.stringify(warn.mock.calls);
        expect(logged).not.toContain("private-name");
        expect(logged).not.toContain(SECRET);
    });

    it.each([
        "pull_request",
        "pull_request_review",
        "issue_comment",
        "check_suite",
    ])("hands %s to the pull request handler", async (event) => {
        handlePullRequestMock.mockResolvedValue({ ok: true, handled: true });
        const payload = { action: "closed", number: 12 };

        const response = await POST(delivery(event, JSON.stringify(payload)));

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(await response.json()).toEqual({ data: { handled: true } });
        expect(handlePullRequestMock).toHaveBeenCalledWith(event, payload, {
            delivery: "delivery-1",
        });
    });

    it("answers 503 GITHUB_WEBHOOK_PROCESSING_FAILED when the card could not be written", async () => {
        handlePullRequestMock.mockResolvedValue({
            ok: false,
            code: "GITHUB_WEBHOOK_PROCESSING_FAILED",
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        });

        const response = await POST(
            delivery("pull_request", JSON.stringify({ action: "closed" }))
        );

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await response.json()).toEqual({
            error: { code: "GITHUB_WEBHOOK_PROCESSING_FAILED" },
        });
    });

    it("checks the signature before handing a pull request event over", async () => {
        const response = await POST(
            delivery("pull_request", "{}", { signature: "sha256=bad" })
        );

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(handlePullRequestMock).not.toHaveBeenCalled();
    });

    it("does not hand ping to the pull request handler", async () => {
        await POST(delivery("ping", "{}"));

        expect(handlePullRequestMock).not.toHaveBeenCalled();
    });
});
