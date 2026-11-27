import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveApiActorMock, findByReferenceIdMock, updateMock } = vi.hoisted(
    () => ({
        resolveApiActorMock: vi.fn(),
        findByReferenceIdMock: vi.fn(),
        updateMock: vi.fn(),
    })
);

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
    },
}));

const { requireSessionApi } = await import("@/app/(guards)/session");

const OWNER_UID = "common-7";
const OTHER_UID = "common-9";
const OWNER_PROFILE = { id: "p2", reference_id: OWNER_UID };
/** A profile written before the panel roles were dropped still carries the old field. */
const LEGACY_ADMIN_PROFILE = {
    id: "p1",
    reference_id: OWNER_UID,
    type: "admin",
};

const ALL_METHODS = [
    "GET",
    "HEAD",
    "OPTIONS",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
];

function request(
    method: string,
    headers: Record<string, string> = {}
): NextRequest {
    return { method, headers: new Headers(headers) } as unknown as NextRequest;
}

async function call(req: NextRequest) {
    const handler = vi.fn().mockResolvedValue(Response.json({ data: "ok" }));
    const response = await requireSessionApi(handler)(req);
    return { handler, response };
}

beforeEach(() => {
    resolveApiActorMock.mockReset();
    findByReferenceIdMock.mockReset();
    updateMock.mockReset();
    resolveApiActorMock.mockResolvedValue({ uid: OWNER_UID });
    findByReferenceIdMock.mockResolvedValue(OWNER_PROFILE);
});

describe("requireSessionApi", () => {
    it("lets the person read and write with their own profile", async () => {
        for (const method of ALL_METHODS) {
            const { handler, response } = await call(request(method));

            expect(response.status).toBe(HTTP_STATUS.OK);
            expect(handler.mock.calls[0][1]).toMatchObject({
                user: { uid: OWNER_UID },
                profile: OWNER_PROFILE,
            });
        }
    });

    it("serves a profile still stored with the old admin type", async () => {
        findByReferenceIdMock.mockResolvedValue(LEGACY_ADMIN_PROFILE);

        const { handler, response } = await call(request("POST"));

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(handler.mock.calls[0][1].profile).toBe(LEGACY_ADMIN_PROFILE);
    });

    it("ignores role and impersonation headers sent by the client", async () => {
        const { handler } = await call(
            request("POST", {
                "x-role": "admin",
                "x-request-user-id": OTHER_UID,
                "x-request-role": "common",
            })
        );

        expect(findByReferenceIdMock).toHaveBeenCalledTimes(1);
        expect(findByReferenceIdMock).toHaveBeenCalledWith(OWNER_UID);
        expect(handler.mock.calls[0][1].profile).toBe(OWNER_PROFILE);
    });

    it("does not write to the profile on the way through", async () => {
        await call(request("GET"));

        expect(updateMock).not.toHaveBeenCalled();
    });

    it("refuses a caller without a profile", async () => {
        findByReferenceIdMock.mockResolvedValue(null);

        const { handler, response } = await call(request("GET"));

        expect(handler).not.toHaveBeenCalled();
        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await response.json()).toEqual({
            error: { code: "AUTH_PROFILE_NOT_FOUND" },
        });
    });

    it("refuses an unauthenticated caller", async () => {
        resolveApiActorMock.mockResolvedValue(null);

        const { handler, response } = await call(request("GET"));

        expect(handler).not.toHaveBeenCalled();
        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(await response.json()).toEqual({
            error: { code: "AUTH_INVALID_TOKEN" },
        });
    });

    it("hands the route context through", async () => {
        const handler = vi.fn().mockResolvedValue(Response.json({}));
        await requireSessionApi<{ params: { id: string } }>(handler)(
            request("GET"),
            { params: { id: "b1" } }
        );

        expect(handler.mock.calls[0][1].params).toEqual({ id: "b1" });
    });
});
