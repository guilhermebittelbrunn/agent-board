import { UserRoleLevel } from "@repo/auth/types";
import { type RunnerDTO, UserType } from "@repo/sdk/src/types";
import { AUTH_REQUEST_HEADER } from "@repo/shared/utils/helpers/auth-request-headers";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOW, runFixture, runnerFixture } from "./runnerFixtures";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    listByUserMock,
    findRunsByIdsMock,
    revokeOwnedMock,
    createRegistrationMock,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    listByUserMock: vi.fn(),
    findRunsByIdsMock: vi.fn(),
    revokeOwnedMock: vi.fn(),
    createRegistrationMock: vi.fn(),
}));

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

vi.mock("@/(shared)/repositories/runner.repository", () => ({
    runnerRepository: {
        listByUser: (...args: unknown[]) => listByUserMock(...args),
        findRunsByIds: (...args: unknown[]) => findRunsByIdsMock(...args),
        revokeOwned: (...args: unknown[]) => revokeOwnedMock(...args),
        createRegistration: (...args: unknown[]) =>
            createRegistrationMock(...args),
    },
}));

const { GET: LIST } = await import("@/app/(routes)/runners/route");
const { DELETE: REVOKE } = await import("@/app/(routes)/runners/[id]/route");
const { POST: REGISTRATION } = await import(
    "@/app/(routes)/runners/registrations/route"
);

type Person = "octo" | "admin";

const NO_CONTENT = 204;
const CODE_TTL_MS = 600_000;
const DISPLAYED_CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const profileOf = (person: Person) => ({
    id: `p-${person}`,
    reference_id: `uid-${person}`,
    type: person === "admin" ? UserType.ADMIN : UserType.COMMON,
    github: null,
});

function request(
    as: Person,
    method = "GET",
    subject: Person = as
): NextRequest {
    const impersonating = as === "admin";
    return {
        method,
        url: "http://localhost:3002/runners",
        headers: new Headers({
            [AUTH_REQUEST_HEADER.USER_ID]: `uid-${as}`,
            [AUTH_REQUEST_HEADER.USER_ROLE]: impersonating
                ? UserRoleLevel.ADMIN
                : UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_ROLE]: UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_USER_ID]: `uid-${subject}`,
        }),
        json: () => Promise.resolve({}),
        text: () => Promise.resolve("{}"),
    } as unknown as NextRequest;
}

beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        listByUserMock,
        findRunsByIdsMock,
        revokeOwnedMock,
        createRegistrationMock,
    ]) {
        mock.mockReset();
    }
    resolveApiActorMock.mockImplementation((req: NextRequest) =>
        Promise.resolve({ uid: req.headers.get(AUTH_REQUEST_HEADER.USER_ID) })
    );
    findByReferenceIdMock.mockImplementation((uid: string) =>
        Promise.resolve(profileOf(uid.replace("uid-", "") as Person))
    );
    findRunsByIdsMock.mockResolvedValue(new Map());
});

describe("GET /runners", () => {
    it("lists the person's runners without any secret or owner id", async () => {
        const busy = runnerFixture({ id: "busy", currentRunId: "run1" });
        listByUserMock.mockResolvedValue([runnerFixture(), busy]);
        findRunsByIdsMock.mockResolvedValue(
            new Map([["run1", runFixture({ runnerId: "busy" })]])
        );

        const response = await LIST(request("octo"));
        const body = (await response.json()) as { data: RunnerDTO[] };
        const raw = JSON.stringify(body);

        expect(listByUserMock).toHaveBeenCalledWith("p-octo");
        expect(raw).not.toContain("tokenHash");
        expect(raw).not.toContain("userId");
        expect(
            body.data.find((runner) => runner.id === "busy")?.currentRun
        ).toEqual({
            boardId: "agent-board-demo--sample-app",
            cardId: "agent-board-demo--sample-app__search-cards",
            slug: "search-cards",
            stageKey: "analyze",
        });
        expect(body.data.every((runner) => runner.online)).toBe(true);
    });
});

describe("DELETE /runners/[id]", () => {
    it("answers 404 for a runner that is not the person's", async () => {
        revokeOwnedMock.mockResolvedValue(false);

        const response = await REVOKE(request("octo", "DELETE"), {
            params: Promise.resolve({ id: "someone-elses" }),
        });

        expect(revokeOwnedMock).toHaveBeenCalledWith(
            "someone-elses",
            "p-octo",
            NOW
        );
        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await response.json()).toEqual({
            error: { code: "RUNNER_NOT_FOUND" },
        });
    });

    it("revokes the person's own runner", async () => {
        revokeOwnedMock.mockResolvedValue(true);

        const response = await REVOKE(request("octo", "DELETE"), {
            params: Promise.resolve({ id: "runnerA" }),
        });

        expect(response.status).toBe(NO_CONTENT);
    });
});

describe("POST /runners/registrations", () => {
    it("returns a ten-minute code and stores only its hash", async () => {
        const response = await REGISTRATION(request("octo", "POST"));
        const body = (await response.json()) as {
            data: { code: string; expiresAt: string };
        };

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(body.data.code).toMatch(DISPLAYED_CODE);
        expect(body.data.expiresAt).toBe(
            new Date(NOW.getTime() + CODE_TTL_MS).toISOString()
        );
        const [stored] = createRegistrationMock.mock.calls[0] as [
            { userId: string; codeHash: string },
        ];
        expect(stored.userId).toBe("p-octo");
        expect(stored.codeHash).toMatch(SHA256_HEX);
        expect(JSON.stringify(stored)).not.toContain(
            body.data.code.replace("-", "")
        );
    });

    it("refuses an admin impersonating the person", async () => {
        const response = await REGISTRATION(request("admin", "POST", "octo"));

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(createRegistrationMock).not.toHaveBeenCalled();
    });
});
