import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import {
    createFakeBoardMemberRepository,
    type FakeBoardMemberRepository,
} from "./fakeBoardMemberRepository";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    getGithubClientMock,
    findBoardMock,
    memberStore,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    findBoardMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
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

// Not `importActual`: the real module reads `@/env`, which validates every variable.
vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/board-member.repository", () => ({
    boardMemberRepository: new Proxy(
        {},
        {
            get: (_target, property: string) =>
                (
                    memberStore.current?.repository as unknown as Record<
                        string,
                        unknown
                    >
                )[property],
        }
    ),
}));

const { GET: LIST, POST: INVITE } = await import(
    "@/app/(routes)/boards/[id]/members/route"
);
const { PATCH, DELETE } = await import(
    "@/app/(routes)/boards/[id]/members/[memberId]/route"
);

const BOARD_ID = "agent-board-demo--sample-app";
const BOARD = {
    id: BOARD_ID,
    ownerUserId: "p-owner",
    ownerGithubId: "1",
    name: "sample-app",
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
    config: {},
    configSource: { path: "", ref: "main", sha: "x", readAt: "" },
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    deletedAt: null,
};

// GitHub permissions come from the emulator client: octo and newcomer are admin,
// qa-maintainer maintain, qa-writer write, qa-reader read.
const PEOPLE = {
    owner: { id: "p-owner", githubId: "1", login: "octo" },
    maintainer: { id: "p-maintainer", githubId: "2", login: "qa-maintainer" },
    operator: { id: "p-operator", githubId: "3", login: "qa-writer" },
    reader: { id: "p-reader", githubId: "4", login: "qa-reader" },
    stranger: { id: "p-stranger", githubId: "5", login: "newcomer" },
} as const;
type Person = keyof typeof PEOPLE;

const profileOf = (person: Person) => {
    const { id, githubId, login } = PEOPLE[person];
    return {
        id,
        reference_id: `uid-${person}`,
        github: { id: githubId, login, name: null, avatarUrl: null },
    };
};

const NO_CONTENT = 204;
/** The owner plus the three active members of `beforeEach`. */
const SEEDED_MEMBERS = 4;

const memberId = (login: string) => `${BOARD_ID}__${login.toLowerCase()}`;

function request(
    as: Person,
    { method = "GET", body }: { method?: string; body?: unknown } = {}
): NextRequest {
    return {
        method,
        url: `http://localhost:3002/boards/${BOARD_ID}/members`,
        headers: new Headers({
            "x-test-actor": `uid-${as}`,
            "content-type": "application/json",
        }),
        json: () => Promise.resolve(body ?? {}),
        text: () => Promise.resolve(JSON.stringify(body ?? {})),
    } as unknown as NextRequest;
}

const boardContext = { params: { id: BOARD_ID } };
const memberContext = (login: string) => ({
    params: { id: BOARD_ID, memberId: memberId(login) },
});

async function errorCode(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } };
    return body.error.code;
}

let members: FakeBoardMemberRepository;

function seedActive(
    person: Person,
    role: "maintainer" | "operator" | "viewer"
) {
    const { id, githubId, login } = PEOPLE[person];
    members.seedInvite(BOARD_ID, login, role, {
        status: "active",
        githubId,
        userId: id,
    });
}

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        getGithubClientMock,
        findBoardMock,
    ]) {
        mock.mockReset();
    }
    getGithubClientMock.mockReturnValue(
        createGithubFakeClient(createGithubPermissionCache())
    );
    findBoardMock.mockResolvedValue(BOARD);
    resolveApiActorMock.mockImplementation((req: NextRequest) =>
        Promise.resolve({ uid: req.headers.get("x-test-actor") })
    );
    findByReferenceIdMock.mockImplementation((uid: string) =>
        Promise.resolve(profileOf(uid.replace("uid-", "") as Person))
    );

    members = createFakeBoardMemberRepository();
    memberStore.current = members;
    members.seedOwner(
        BOARD_ID,
        {
            userId: PEOPLE.owner.id,
            github: { id: "1", login: "octo", name: null, avatarUrl: null },
        },
        new Date("2026-11-25T10:00:00.000Z")
    );
    seedActive("maintainer", "maintainer");
    seedActive("operator", "operator");
    seedActive("reader", "operator");
});

describe("GET /boards/[id]/members", () => {
    it("lists every member with the role that counts, flagging the caller", async () => {
        const response = await LIST(request("owner"), boardContext);
        const body = (await response.json()) as {
            data: {
                login: string;
                role: string;
                effectiveRole: string | null;
                isSelf: boolean;
            }[];
        };

        expect(response.status).toBe(HTTP_STATUS.OK);
        const byLogin = Object.fromEntries(
            body.data.map((member) => [member.login, member])
        );
        expect(byLogin.octo).toMatchObject({ role: "owner", isSelf: true });
        expect(byLogin["qa-maintainer"]).toMatchObject({ isSelf: false });
        expect(body.data).toHaveLength(SEEDED_MEMBERS);
        expect(body.data[0]).not.toHaveProperty("userId");
    });

    it("lets a viewer read the list", async () => {
        const response = await LIST(request("reader"), boardContext);

        expect(response.status).toBe(HTTP_STATUS.OK);
    });

    it("answers BOARD_NOT_FOUND to someone who is not a member", async () => {
        const response = await LIST(request("stranger"), boardContext);

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_NOT_FOUND");
    });

    it("shows a member capped by GitHub with the lower role", async () => {
        await LIST(request("reader"), boardContext);
        const response = await LIST(request("owner"), boardContext);
        const body = (await response.json()) as {
            data: {
                login: string;
                githubRole: string;
                effectiveRole: string;
            }[];
        };

        expect(
            body.data.find((member) => member.login === "qa-reader")
        ).toMatchObject({
            role: "operator",
            githubRole: "read",
            effectiveRole: "viewer",
        });
    });
});

describe("POST /boards/[id]/members", () => {
    const invite = (as: Person, body: unknown) =>
        INVITE(request(as, { method: "POST", body }), boardContext);

    it("creates a pending invitation without asking GitHub", async () => {
        const response = await invite("owner", {
            login: "Joao-PM",
            role: "operator",
        });
        const body = (await response.json()) as { data: unknown };

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(body.data).toMatchObject({
            id: memberId("joao-pm"),
            login: "Joao-PM",
            role: "operator",
            status: "pending",
            githubRole: null,
            effectiveRole: null,
            isSelf: false,
        });
        expect(members.documents.get(memberId("joao-pm"))).toMatchObject({
            invitedByUserId: PEOPLE.owner.id,
        });
    });

    it("lets a maintainer invite up to maintainer", async () => {
        const response = await invite("maintainer", {
            login: "joao-pm",
            role: "maintainer",
        });

        expect(response.status).toBe(HTTP_STATUS.CREATED);
    });

    it.each(["qa-writer", "QA-WRITER"])(
        "answers BOARD_MEMBER_ALREADY_EXISTS for %s",
        async (login) => {
            const response = await invite("owner", { login, role: "viewer" });

            expect(response.status).toBe(HTTP_STATUS.CONFLICT);
            expect(await errorCode(response)).toBe(
                "BOARD_MEMBER_ALREADY_EXISTS"
            );
        }
    );

    it("answers BOARD_MEMBER_ALREADY_EXISTS for a second invitation", async () => {
        await invite("owner", { login: "joao-pm", role: "viewer" });
        const response = await invite("owner", {
            login: "joao-pm",
            role: "operator",
        });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("BOARD_MEMBER_ALREADY_EXISTS");
    });

    it.each([
        { login: "-bad", role: "viewer" },
        { login: "joao-pm", role: "owner" },
        { login: "joao-pm", role: "admin" },
        { login: "joao-pm" },
    ])("refuses %j with VALIDATION_FAILED", async (body) => {
        const response = await invite("owner", body);

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    });

    it.each(["operator", "reader"] as const)(
        "refuses the %s with BOARD_ROLE_INSUFFICIENT",
        async (as) => {
            const response = await invite(as, {
                login: "joao-pm",
                role: "viewer",
            });

            expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
            expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
            expect(members.documents.has(memberId("joao-pm"))).toBe(false);
        }
    );
});

describe("PATCH /boards/[id]/members/[memberId]", () => {
    const patch = (as: Person, login: string, body: unknown) =>
        PATCH(request(as, { method: "PATCH", body }), memberContext(login));

    it("changes the role of a member", async () => {
        await LIST(request("operator"), boardContext);
        const response = await patch("owner", "qa-writer", { role: "viewer" });
        const body = (await response.json()) as { data: unknown };

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(body.data).toMatchObject({
            login: "qa-writer",
            role: "viewer",
            effectiveRole: "viewer",
        });
        expect(members.documents.get(memberId("qa-writer"))).toMatchObject({
            role: "viewer",
        });
    });

    it("lets a maintainer promote up to maintainer", async () => {
        const response = await patch("maintainer", "qa-writer", {
            role: "maintainer",
        });

        expect(response.status).toBe(HTTP_STATUS.OK);
    });

    it.each([
        ["the owner", "octo"],
        ["themselves", "qa-maintainer"],
    ])("refuses a maintainer changing %s", async (_label, login) => {
        const response = await patch("maintainer", login, { role: "viewer" });

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_MEMBER_CHANGE_FORBIDDEN");
    });

    it("refuses the owner changing their own row", async () => {
        const response = await patch("owner", "octo", { role: "viewer" });

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_MEMBER_CHANGE_FORBIDDEN");
    });

    it("refuses an operator with BOARD_ROLE_INSUFFICIENT", async () => {
        const response = await patch("operator", "qa-reader", {
            role: "viewer",
        });

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
    });

    it("refuses a maintainer capped below maintainer by GitHub", async () => {
        getGithubClientMock.mockReturnValue({
            ...createGithubFakeClient(createGithubPermissionCache()),
            getCollaboratorRole: () => Promise.resolve("write"),
        });

        const response = await patch("maintainer", "qa-writer", {
            role: "viewer",
        });

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
    });

    it("answers BOARD_MEMBER_NOT_FOUND for a member of another board", async () => {
        members.seedInvite("acme--api", "someone", "viewer");

        const response = await PATCH(
            request("owner", { method: "PATCH", body: { role: "viewer" } }),
            { params: { id: BOARD_ID, memberId: "acme--api__someone" } }
        );

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_MEMBER_NOT_FOUND");
        expect(members.documents.get("acme--api__someone")).toMatchObject({
            role: "viewer",
        });
    });

    it("answers BOARD_MEMBER_NOT_FOUND for an unknown member", async () => {
        const response = await patch("owner", "nobody", { role: "viewer" });

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_MEMBER_NOT_FOUND");
    });

    it("refuses owner as the new role with VALIDATION_FAILED", async () => {
        const response = await patch("owner", "qa-writer", { role: "owner" });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    });
});

describe("DELETE /boards/[id]/members/[memberId]", () => {
    const remove = (as: Person, login: string) =>
        DELETE(request(as, { method: "DELETE" }), memberContext(login));

    it("removes a member", async () => {
        const response = await remove("owner", "qa-writer");

        expect(response.status).toBe(NO_CONTENT);
        expect(members.documents.has(memberId("qa-writer"))).toBe(false);
    });

    it("cancels a pending invitation", async () => {
        members.seedInvite(BOARD_ID, "joao-pm", "viewer");

        const response = await remove("maintainer", "joao-pm");

        expect(response.status).toBe(NO_CONTENT);
        expect(members.documents.has(memberId("joao-pm"))).toBe(false);
    });

    it("lets the removed member lose the board", async () => {
        await remove("owner", "qa-writer");

        const response = await LIST(request("operator"), boardContext);

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_NOT_FOUND");
    });

    it.each([
        ["owner", "octo"],
        ["maintainer", "octo"],
        ["maintainer", "qa-maintainer"],
    ] as const)("refuses the %s removing %s", async (as, login) => {
        const response = await remove(as, login);

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_MEMBER_CHANGE_FORBIDDEN");
        expect(members.documents.has(memberId(login))).toBe(true);
    });

    it("refuses a viewer with BOARD_ROLE_INSUFFICIENT", async () => {
        const response = await remove("reader", "qa-writer");

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
        expect(members.documents.has(memberId("qa-writer"))).toBe(true);
    });
});
