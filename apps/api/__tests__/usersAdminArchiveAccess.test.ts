import { UserRoleLevel } from "@repo/auth/types";
import { UserType } from "@repo/sdk/src/types";
import { AUTH_REQUEST_HEADER } from "@repo/shared/utils/helpers/auth-request-headers";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    findByIdMock,
    deleteMock,
    updateUserMock,
    revokeUserSessionsMock,
    logEventMock,
    calls,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    findByIdMock: vi.fn(),
    deleteMock: vi.fn(),
    updateUserMock: vi.fn(),
    revokeUserSessionsMock: vi.fn(),
    logEventMock: vi.fn(),
    calls: [] as string[],
}));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
        touchLastAccess: vi.fn(),
        findById: (...args: unknown[]) => findByIdMock(...args),
        delete: (...args: unknown[]) => {
            calls.push("delete");
            return deleteMock(...args);
        },
    },
}));

vi.mock("@/(shared)/lib/user-merge", () => ({
    getMergedUserByFirestoreDocId: vi.fn(),
    getMergedUserByUid: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
    getAuthInstance: () => ({
        updateUser: (...args: unknown[]) => {
            calls.push("disable");
            return updateUserMock(...args);
        },
    }),
    getCurrentUser: vi.fn(),
    revokeUserSessions: (...args: unknown[]) => {
        calls.push("revoke");
        return revokeUserSessionsMock(...args);
    },
}));

vi.mock("@/env", () => ({
    env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

vi.mock("@repo/shared/utils/helpers/log", () => ({
    logEvent: (...args: unknown[]) => logEventMock(...args),
}));

const { DELETE } = await import("@/app/(routes)/users/[id]/route");

const ADMIN_UID = "admin-1";
const TARGET_DOC_ID = "p2";
const TARGET_UID = "common-9";
const STATUS_NO_CONTENT = 204;

const ADMIN_PROFILE = {
    id: "p1",
    reference_id: ADMIN_UID,
    type: UserType.ADMIN,
};

function target() {
    return {
        id: TARGET_DOC_ID,
        reference_id: TARGET_UID,
        type: UserType.COMMON,
    };
}

function request(): NextRequest {
    return {
        method: "DELETE",
        url: `http://localhost:3002/users/${TARGET_DOC_ID}`,
        headers: new Headers({
            [AUTH_REQUEST_HEADER.USER_ID]: ADMIN_UID,
            [AUTH_REQUEST_HEADER.USER_ROLE]: UserRoleLevel.ADMIN,
            [AUTH_REQUEST_HEADER.REQUEST_ROLE]: UserRoleLevel.ADMIN,
            [AUTH_REQUEST_HEADER.REQUEST_USER_ID]: ADMIN_UID,
            "x-request-id": "req-7",
        }),
        json: () => Promise.resolve({}),
    } as unknown as NextRequest;
}

const routeContext = { params: { id: TARGET_DOC_ID } };

function archive() {
    return DELETE(request(), routeContext);
}

function authFailureLog() {
    return logEventMock.mock.calls.find(
        ([, event]) => event === "admin-user-delete-auth-failed"
    );
}

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        findByIdMock,
        deleteMock,
        updateUserMock,
        revokeUserSessionsMock,
        logEventMock,
    ]) {
        mock.mockReset();
    }
    calls.length = 0;

    resolveApiActorMock.mockResolvedValue({
        uid: ADMIN_UID,
        email: "admin@example.com",
    });
    findByReferenceIdMock.mockResolvedValue(ADMIN_PROFILE);
    findByIdMock.mockResolvedValue(target());
    deleteMock.mockResolvedValue(undefined);
    updateUserMock.mockResolvedValue({});
    revokeUserSessionsMock.mockResolvedValue(undefined);
});

describe("DELETE /users/[id] takes the account's access away", () => {
    it("disables the account and revokes its sessions before archiving", async () => {
        const response = await archive();

        expect(response.status).toBe(STATUS_NO_CONTENT);
        expect(updateUserMock).toHaveBeenCalledWith(TARGET_UID, {
            disabled: true,
        });
        expect(revokeUserSessionsMock).toHaveBeenCalledWith(TARGET_UID);
        expect(calls).toEqual(["disable", "revoke", "delete"]);
    });

    it("refuses to archive when Firebase Auth rejects the disable, logging only the provider code", async () => {
        updateUserMock.mockRejectedValue({
            code: "auth/internal-error",
            message: "provider-detail",
        });

        const response = await archive();

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await response.json()).toEqual({
            error: { code: "USERS_DELETE_AUTH_FAILED" },
        });
        expect(deleteMock).not.toHaveBeenCalled();
        expect(revokeUserSessionsMock).not.toHaveBeenCalled();
        expect(authFailureLog()?.[2]).toEqual({
            requestId: "req-7",
            reason: "auth/internal-error",
        });
        expect(JSON.stringify(logEventMock.mock.calls)).not.toContain(
            "provider-detail"
        );
    });

    it("archives a profile whose account is already gone from Firebase Auth", async () => {
        updateUserMock.mockRejectedValue({ code: "auth/user-not-found" });

        const response = await archive();

        expect(response.status).toBe(STATUS_NO_CONTENT);
        expect(updateUserMock).toHaveBeenCalledWith(TARGET_UID, {
            disabled: true,
        });
        expect(revokeUserSessionsMock).not.toHaveBeenCalled();
        expect(deleteMock).toHaveBeenCalledWith(TARGET_DOC_ID);
    });

    it("leaves the caller's own account alone when refusing to archive them", async () => {
        findByIdMock.mockResolvedValue(ADMIN_PROFILE);

        const response = await archive();

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await response.json()).toEqual({
            error: { code: "USERS_SELF_LOCKOUT_FORBIDDEN" },
        });
        expect(updateUserMock).not.toHaveBeenCalled();
        expect(revokeUserSessionsMock).not.toHaveBeenCalled();
    });

    it("answers 404 for a missing profile without touching the account", async () => {
        findByIdMock.mockResolvedValue(null);

        const response = await archive();

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await response.json()).toEqual({
            error: { code: "USERS_NOT_FOUND" },
        });
        expect(updateUserMock).not.toHaveBeenCalled();
        expect(revokeUserSessionsMock).not.toHaveBeenCalled();
    });
});
