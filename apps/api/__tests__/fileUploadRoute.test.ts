import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    isStorageConfiguredMock,
    putObjectMock,
    signReadUrlMock,
    parseUploadedImageMock,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    isStorageConfiguredMock: vi.fn(),
    putObjectMock: vi.fn(),
    signReadUrlMock: vi.fn(),
    parseUploadedImageMock: vi.fn(),
}));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
    },
}));

// Not `importActual`: the real module reaches Firebase Admin through `server-only`,
// which refuses to load outside a server component.
vi.mock("@/(shared)/lib/storage", () => ({
    isStorageConfigured: () => isStorageConfiguredMock(),
    buildObjectPath: (ownerId: string, extension: string) =>
        `uploads/${ownerId}/${crypto.randomUUID()}.${extension}`,
    putObject: (...args: unknown[]) => putObjectMock(...args),
    signReadUrl: (...args: unknown[]) => signReadUrlMock(...args),
}));

vi.mock("@/(shared)/validation/file.schema", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/(shared)/validation/file.schema")
    >()),
    parseUploadedImage: (...args: unknown[]) => parseUploadedImageMock(...args),
}));

const { POST } = await import("@/app/(routes)/files/route");

const OWNER_UID = "common-9";

const OWNER_PROFILE = {
    id: "p2",
    reference_id: OWNER_UID,
};

const SIGNED_URL = "https://storage.googleapis.com/bucket/object?X-Goog-Sig=1";
const EXPIRES_AT = "2026-09-11T01:03:00.000Z";
const STATUS_CREATED = 201;
const PNG_SIZE = 1024;
/** Comfortably past the 4 MiB ceiling, to stand in for a body the route must turn away. */
const OVERSIZED_BYTES = 12_582_912;
const PNG_MAGIC_HEX = "89504e47";

const ACCEPTED_IMAGE = {
    ok: true as const,
    value: {
        body: Buffer.from(PNG_MAGIC_HEX, "hex"),
        contentType: "image/png",
        extension: "png",
        size: PNG_SIZE,
    },
};

function uploadRequest(
    headers: Record<string, string>,
    query = ""
): NextRequest {
    return {
        method: "POST",
        url: `http://localhost:3002/files${query}`,
        headers: new Headers(headers),
        formData: () => Promise.resolve(new FormData()),
    } as unknown as NextRequest;
}

const asOwner = (query = "") =>
    uploadRequest(
        {
            "x-test-actor": OWNER_UID,
        },
        query
    );

async function errorCode(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } };
    return body.error.code;
}

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        isStorageConfiguredMock,
        putObjectMock,
        signReadUrlMock,
        parseUploadedImageMock,
    ]) {
        mock.mockReset();
    }

    resolveApiActorMock.mockResolvedValue({ uid: OWNER_UID });
    findByReferenceIdMock.mockResolvedValue(OWNER_PROFILE);
    isStorageConfiguredMock.mockReturnValue(true);
    putObjectMock.mockResolvedValue(undefined);
    signReadUrlMock.mockResolvedValue({
        url: SIGNED_URL,
        expiresAt: EXPIRES_AT,
    });
    parseUploadedImageMock.mockResolvedValue(ACCEPTED_IMAGE);
});

describe("POST /files", () => {
    it("stores the object under the caller's own prefix and answers with a signed url", async () => {
        const response = await POST(asOwner());

        expect(response.status).toBe(STATUS_CREATED);

        const body = (await response.json()) as {
            data: { path: string; url: string; expiresAt: string };
        };

        expect(body.data.path).toMatch(
            new RegExp(`^uploads/${OWNER_PROFILE.id}/[0-9a-f-]{36}\\.png$`)
        );
        expect(body.data.url).toBe(SIGNED_URL);
        expect(body.data.expiresAt).toBe(EXPIRES_AT);
        expect(putObjectMock).toHaveBeenCalledWith(
            body.data.path,
            ACCEPTED_IMAGE.value.body,
            "image/png"
        );
    });

    /**
     * Whether the fork configured a bucket has nothing to do with what was sent, so the
     * refusal must come before the body is even read.
     */
    it("refuses without a bucket, before touching the body", async () => {
        isStorageConfiguredMock.mockReturnValue(false);

        const response = await POST(asOwner());

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("STORAGE_NOT_CONFIGURED");
        expect(parseUploadedImageMock).not.toHaveBeenCalled();
        expect(putObjectMock).not.toHaveBeenCalled();
    });

    it("passes the validation refusal through untouched", async () => {
        parseUploadedImageMock.mockResolvedValue({
            ok: false,
            response: Response.json(
                { error: { code: "UPLOAD_FILE_TYPE_NOT_ALLOWED" } },
                { status: HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE }
            ),
        });

        const response = await POST(asOwner());

        expect(response.status).toBe(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE);
        expect(await errorCode(response)).toBe("UPLOAD_FILE_TYPE_NOT_ALLOWED");
        expect(putObjectMock).not.toHaveBeenCalled();
    });

    it("answers a stable code when the provider rejects the write", async () => {
        putObjectMock.mockRejectedValue(new Error("bucket exploded"));

        const response = await POST(asOwner());

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("UPLOAD_FAILED");
        expect(signReadUrlMock).not.toHaveBeenCalled();
    });

    it("answers the same stable code when the write lands but signing fails", async () => {
        signReadUrlMock.mockRejectedValue(new Error("no signing key"));

        const response = await POST(asOwner());

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("UPLOAD_FAILED");
    });

    it("refuses an unauthenticated caller", async () => {
        resolveApiActorMock.mockResolvedValue(null);

        const response = await POST(asOwner());

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(await errorCode(response)).toBe("AUTH_INVALID_TOKEN");
        expect(putObjectMock).not.toHaveBeenCalled();
    });

    /**
     * Every refusal stays inside the error vocabulary, whatever the caller announced:
     * a payload the panel cannot translate is as good as no answer at all.
     */
    it.each([
        ["no session", null, HTTP_STATUS.UNAUTHORIZED, "AUTH_INVALID_TOKEN"],
        [
            "a session",
            { uid: OWNER_UID },
            HTTP_STATUS.PAYLOAD_TOO_LARGE,
            "UPLOAD_FILE_TOO_LARGE",
        ],
    ] as const)(
        "answers a translatable json body to an oversized upload with %s",
        async (_label, actor, status, code) => {
            resolveApiActorMock.mockResolvedValue(actor);
            parseUploadedImageMock.mockResolvedValue({
                ok: false,
                response: Response.json(
                    { error: { code: "UPLOAD_FILE_TOO_LARGE" } },
                    { status: HTTP_STATUS.PAYLOAD_TOO_LARGE }
                ),
            });

            const request = asOwner();
            request.headers.set("content-length", String(OVERSIZED_BYTES));

            const response = await POST(request);

            expect(response.status).toBe(status);
            expect(response.headers.get("content-type")).toContain(
                "application/json"
            );
            expect(await errorCode(response)).toBe(code);
            expect(putObjectMock).not.toHaveBeenCalled();
        }
    );
});
