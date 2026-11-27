import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    resolveApiActorMock,
    getUserMock,
    findByReferenceIdMock,
    findByIdMock,
    createMock,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    getUserMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    findByIdMock: vi.fn(),
    createMock: vi.fn(),
}));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@repo/auth/server", () => ({
    getAuthInstance: () => ({ getUser: getUserMock, updateUser: vi.fn() }),
    getCurrentUser: vi.fn(),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
        findById: (...args: unknown[]) => findByIdMock(...args),
        create: (...args: unknown[]) => createMock(...args),
    },
}));

vi.mock("@/env", () => ({
    env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

const { GET: getMe } = await import("@/app/(routes)/auth/me/route");

const OWNER_UID = "auth-owner";
const CREATED_AT_ISO = "2024-03-01T10:00:00.000Z";
const UPDATED_AT_ISO = "2024-05-02T08:30:00.000Z";

function authRecord(uid: string) {
    return {
        uid,
        email: `${uid}@example.com`,
        emailVerified: true,
        displayName: null,
        photoURL: null,
        phoneNumber: null,
        disabled: false,
        metadata: {
            creationTime: "Mon, 01 Jan 2024 00:00:00 GMT",
            lastSignInTime: null,
            lastRefreshTime: null,
        },
        providerData: [],
        customClaims: null,
        tokensValidAfterTime: undefined,
    };
}

/** Written before the panel roles were dropped: the old `type` must not reach the session. */
function storedProfile(id: string, uid: string) {
    return {
        id,
        reference_id: uid,
        type: "admin",
        createdAt: Timestamp.fromDate(new Date(CREATED_AT_ISO)),
        updatedAt: Timestamp.fromDate(new Date(UPDATED_AT_ISO)),
        deletedAt: null,
    };
}

const OWNER_PROFILE = storedProfile("p1", OWNER_UID);

function request(method: string) {
    return {
        method,
        url: "http://localhost:3002/",
        headers: new Headers(),
    } as unknown as NextRequest;
}

beforeEach(() => {
    resolveApiActorMock.mockReset();
    getUserMock.mockReset();
    findByReferenceIdMock.mockReset();
    findByIdMock.mockReset();
    createMock.mockReset();

    resolveApiActorMock.mockResolvedValue(authRecord(OWNER_UID));
    getUserMock.mockImplementation((uid: string) =>
        Promise.resolve(authRecord(uid))
    );
    findByReferenceIdMock.mockResolvedValue(OWNER_PROFILE);
    findByIdMock.mockResolvedValue(OWNER_PROFILE);
});

describe("GET /auth/me", () => {
    it("answers with exactly the session allow-list of the merged profile", async () => {
        const response = await getMe(request("GET"));
        const body = await response.json();

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(Object.keys(body.data).sort()).toEqual([
            "email",
            "preferences",
            "uid",
        ]);
        expect(body.data).toEqual({
            uid: OWNER_UID,
            email: `${OWNER_UID}@example.com`,
            preferences: null,
        });
    });

    it("never leaks the raw Firestore Timestamp shape", async () => {
        const response = await getMe(request("GET"));

        expect(JSON.stringify(await response.json())).not.toContain("_seconds");
    });

    it("refuses a caller without a valid credential", async () => {
        resolveApiActorMock.mockResolvedValue(null);

        const response = await getMe(request("GET"));

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });
});
