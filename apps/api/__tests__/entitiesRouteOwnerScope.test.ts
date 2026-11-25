import { UserRoleLevel } from "@repo/auth/types";
import { EntityType, UserType } from "@repo/sdk/src/types";
import { AUTH_REQUEST_HEADER } from "@repo/shared/utils/helpers/auth-request-headers";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    findOwnedByMock,
    updateMock,
    deleteMock,
    deleteObjectQuietlyMock,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    findOwnedByMock: vi.fn(),
    updateMock: vi.fn(),
    deleteMock: vi.fn(),
    deleteObjectQuietlyMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: {} }));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
        touchLastAccess: vi.fn(),
    },
}));

vi.mock("@/(shared)/repositories/entity.repository", () => ({
    entityRepository: {
        findOwnedBy: (...args: unknown[]) => findOwnedByMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
        delete: (...args: unknown[]) => deleteMock(...args),
    },
}));

const STORAGE_OBJECT_PATH_RE =
    /^uploads\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

// Not `importActual`: the real module reaches Firebase Admin through `server-only`,
// which refuses to load outside a server component.
vi.mock("@/(shared)/lib/storage", () => ({
    isStorageConfigured: () => false,
    signReadUrl: vi.fn(),
    deleteObjectQuietly: (...args: unknown[]) =>
        deleteObjectQuietlyMock(...args),
    isStorageObjectPath: (value: string) => STORAGE_OBJECT_PATH_RE.test(value),
    isOwnedBy: (path: string, ownerId: string) =>
        path.startsWith(`uploads/${ownerId}/`),
}));

const {
    GET,
    PUT,
    DELETE: DELETE_BY_ID,
} = await import("@/app/(routes)/entities/[id]/route");

const OWNER_UID = "owner-uid";
const OWNER_PROFILE = {
    id: "owner-profile",
    reference_id: OWNER_UID,
    type: UserType.COMMON,
};

const OBJECT_NAME = "9f1c8e30-4b7a-4c21-9f2a-3c5b0d8e1a44.webp";
const OWN_PHOTO = `uploads/${OWNER_PROFILE.id}/${OBJECT_NAME}`;
const NEW_OWN_PHOTO = `uploads/${OWNER_PROFILE.id}/11111111-2222-4333-8444-555555555555.png`;
const SOMEONE_ELSES_PHOTO = `uploads/another-profile/${OBJECT_NAME}`;

const ENTITY_ID = "entity-of-the-owner";
const STATUS_NO_CONTENT = 204;

const OWNERS_RECORD = {
    id: ENTITY_ID,
    userId: OWNER_PROFILE.id,
    name: "Acme",
    description: "Created by the owner",
    type: EntityType.CUSTOMER,
    photo: null as string | null,
    genre: null,
    birthdate: null,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
};

function asOwner(method: string, body?: unknown): NextRequest {
    return {
        method,
        url: `http://localhost:3002/entities/${ENTITY_ID}`,
        headers: new Headers({
            [AUTH_REQUEST_HEADER.USER_ID]: OWNER_UID,
            [AUTH_REQUEST_HEADER.USER_ROLE]: UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_ROLE]: UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_USER_ID]: OWNER_UID,
        }),
        json: () => Promise.resolve(body ?? {}),
    } as unknown as NextRequest;
}

const idContext = { params: { id: ENTITY_ID } };

async function errorCode(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } };
    return body.error.code;
}

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        findOwnedByMock,
        updateMock,
        deleteMock,
        deleteObjectQuietlyMock,
    ]) {
        mock.mockReset();
    }
    resolveApiActorMock.mockResolvedValue({ uid: OWNER_UID });
    findByReferenceIdMock.mockResolvedValue(OWNER_PROFILE);
    findOwnedByMock.mockResolvedValue(OWNERS_RECORD);
    updateMock.mockResolvedValue(ENTITY_ID);
    deleteMock.mockResolvedValue(undefined);
    deleteObjectQuietlyMock.mockResolvedValue(undefined);
});

describe("a record of someone else", () => {
    beforeEach(() => {
        findOwnedByMock.mockResolvedValue(null);
    });

    it.each([
        ["GET", () => GET(asOwner("GET"), idContext)],
        ["PUT", () => PUT(asOwner("PUT", { name: "Taken" }), idContext)],
        ["DELETE", () => DELETE_BY_ID(asOwner("DELETE"), idContext)],
    ] as const)(
        "answers 404 to %s and writes nothing",
        async (_method, call) => {
            const response = await call();

            expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
            expect(await errorCode(response)).toBe("ENTITY_NOT_FOUND");
            expect(findOwnedByMock).toHaveBeenCalledWith(
                ENTITY_ID,
                OWNER_PROFILE.id
            );
            expect(updateMock).not.toHaveBeenCalled();
            expect(deleteMock).not.toHaveBeenCalled();
        }
    );
});

describe("the owner's record", () => {
    it("is readable", async () => {
        const response = await GET(asOwner("GET"), idContext);

        expect(response.status).toBe(HTTP_STATUS.OK);
    });

    it("is editable", async () => {
        const response = await PUT(
            asOwner("PUT", { name: "Renamed" }),
            idContext
        );

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(updateMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: ENTITY_ID, name: "Renamed" })
        );
    });

    it("can be deleted", async () => {
        const response = await DELETE_BY_ID(asOwner("DELETE"), idContext);

        expect(response.status).toBe(STATUS_NO_CONTENT);
        expect(deleteMock).toHaveBeenCalledWith(ENTITY_ID);
    });
});

describe("the photo of the owner's record", () => {
    /** The edit form sends the current photo back on every save. */
    it("saves when the form sends back the untouched photo", async () => {
        findOwnedByMock.mockResolvedValue({
            ...OWNERS_RECORD,
            photo: OWN_PHOTO,
        });

        const response = await PUT(
            asOwner("PUT", { name: "Renamed", photo: OWN_PHOTO }),
            idContext
        );

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(updateMock).toHaveBeenCalled();
        expect(deleteObjectQuietlyMock).not.toHaveBeenCalled();
    });

    it("refuses an object under someone else's prefix", async () => {
        const response = await PUT(
            asOwner("PUT", { photo: SOMEONE_ELSES_PHOTO }),
            idContext
        );

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("ENTITY_PHOTO_INVALID");
        expect(updateMock).not.toHaveBeenCalled();
    });

    it("deletes the superseded photo", async () => {
        findOwnedByMock.mockResolvedValue({
            ...OWNERS_RECORD,
            photo: OWN_PHOTO,
        });

        await PUT(asOwner("PUT", { photo: NEW_OWN_PHOTO }), idContext);

        expect(deleteObjectQuietlyMock).toHaveBeenCalledWith(OWN_PHOTO);
    });
});
