import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    getIdTokenSessionMock,
    lookupProviderMock,
    findByReferenceIdMock,
    hasArchivedProfileMock,
    createMock,
    updateMock,
    getUserMock,
} = vi.hoisted(() => ({
    getIdTokenSessionMock: vi.fn(),
    lookupProviderMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    hasArchivedProfileMock: vi.fn(),
    createMock: vi.fn(),
    updateMock: vi.fn(),
    getUserMock: vi.fn(),
}));

class FakeIdentityToolkitError extends Error {}

vi.mock("@/(shared)/lib/firebase-identity-toolkit", () => ({
    IdentityToolkitError: FakeIdentityToolkitError,
    identityLookupProvider: (...args: unknown[]) => lookupProviderMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
        hasArchivedProfile: (...args: unknown[]) =>
            hasArchivedProfileMock(...args),
        create: (...args: unknown[]) => createMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
    },
}));

vi.mock("@repo/auth/server", () => ({
    getIdTokenSession: (...args: unknown[]) => getIdTokenSessionMock(...args),
    getAuthInstance: () => ({
        getUser: (...a: unknown[]) => getUserMock(...a),
        updateUser: vi.fn(),
    }),
    getCurrentUser: vi.fn(),
    revokeUserSessions: vi.fn(),
}));

const { POST } = await import("@/app/(routes)/auth/sign-in/github/route");

const UID = "firebase-uid-1";
const ID_TOKEN = "firebase-id-token";
const GITHUB_ID = "583231";
const ID_TOKEN_MAX_LENGTH = 4096;

const IDENTITY = {
    id: GITHUB_ID,
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
};

const PROVIDER_INFO = {
    providerId: "github.com",
    rawId: GITHUB_ID,
    screenName: IDENTITY.login,
    displayName: IDENTITY.name,
    photoUrl: IDENTITY.avatarUrl,
};

function authUser() {
    return {
        uid: UID,
        email: "octocat@example.com",
        emailVerified: true,
        displayName: "The Octocat",
        photoURL: null,
        phoneNumber: null,
        disabled: false,
        metadata: {},
        providerData: [],
        customClaims: null,
        tokensValidAfterTime: undefined,
    };
}

function sessionSignedInWith(provider: string, githubId = GITHUB_ID) {
    return {
        user: authUser(),
        decoded: {
            uid: UID,
            firebase: {
                sign_in_provider: provider,
                identities: { "github.com": [githubId] },
            },
        },
    };
}

function profile(github?: unknown) {
    return {
        id: "profile-1",
        reference_id: UID,
        createdAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        ...(github === undefined ? {} : { github }),
    };
}

function githubRequest(body: unknown = { idToken: ID_TOKEN }): Request {
    return new Request("http://localhost:3002/auth/sign-in/github", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
    getIdTokenSessionMock.mockResolvedValue(sessionSignedInWith("github.com"));
    lookupProviderMock.mockResolvedValue(PROVIDER_INFO);
    getUserMock.mockResolvedValue(authUser());
    hasArchivedProfileMock.mockResolvedValue(false);
    findByReferenceIdMock.mockResolvedValue(profile(IDENTITY));
    createMock.mockResolvedValue(profile());
    updateMock.mockResolvedValue("profile-1");
});

describe("POST /auth/sign-in/github — primeiro login", () => {
    it("cria o perfil e grava a identidade lida do Firebase", async () => {
        findByReferenceIdMock.mockResolvedValue(null);

        const response = await POST(githubRequest());

        expect(response.status).toBe(HTTP_STATUS.OK);
        await expect(response.json()).resolves.toEqual({
            user: {
                uid: UID,
                email: "octocat@example.com",
                preferences: null,
            },
        });
        expect(createMock).toHaveBeenCalledTimes(1);
        expect(createMock).toHaveBeenCalledWith(
            expect.objectContaining({
                reference_id: UID,
            })
        );
        expect(updateMock).toHaveBeenCalledWith({
            id: "profile-1",
            github: IDENTITY,
        });
        expect(lookupProviderMock).toHaveBeenCalledWith(ID_TOKEN, "github.com");
    });

    it("grava nome e avatar como null quando o GitHub não os tem", async () => {
        findByReferenceIdMock.mockResolvedValue(null);
        lookupProviderMock.mockResolvedValue({
            providerId: "github.com",
            rawId: GITHUB_ID,
            screenName: "octocat",
        });

        await POST(githubRequest());

        expect(updateMock).toHaveBeenCalledWith({
            id: "profile-1",
            github: {
                id: GITHUB_ID,
                login: "octocat",
                name: null,
                avatarUrl: null,
            },
        });
    });
});

describe("POST /auth/sign-in/github — login repetido", () => {
    it("atualiza o login que mudou no GitHub", async () => {
        lookupProviderMock.mockResolvedValue({
            ...PROVIDER_INFO,
            screenName: "octocat-renamed",
        });

        const response = await POST(githubRequest());

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(createMock).not.toHaveBeenCalled();
        expect(updateMock).toHaveBeenCalledWith({
            id: "profile-1",
            github: { ...IDENTITY, login: "octocat-renamed" },
        });
    });

    it("não escreve quando nada mudou", async () => {
        const response = await POST(githubRequest());

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(updateMock).not.toHaveBeenCalled();
        expect(createMock).not.toHaveBeenCalled();
    });

    it("ignora o login que o corpo da requisição tente mandar", async () => {
        await POST(githubRequest({ idToken: ID_TOKEN, login: "admin" }));

        expect(updateMock).not.toHaveBeenCalled();
    });
});

describe("POST /auth/sign-in/github — recusas", () => {
    it.each([
        ["sem corpo", ""],
        ["com JSON inválido", "{idToken:"],
        ["sem idToken", {}],
        ["com idToken vazio", { idToken: "" }],
        [
            "com idToken acima do teto",
            { idToken: "x".repeat(ID_TOKEN_MAX_LENGTH + 1) },
        ],
    ])("responde 400 VALIDATION_FAILED %s", async (_label, body) => {
        const response = await POST(githubRequest(body));

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        await expect(response.json()).resolves.toEqual({
            error: { code: "VALIDATION_FAILED" },
        });
        expect(getIdTokenSessionMock).not.toHaveBeenCalled();
    });

    it("responde 401 AUTH_INVALID_TOKEN para token que não verifica", async () => {
        getIdTokenSessionMock.mockResolvedValue(null);

        const response = await POST(githubRequest());

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        await expect(response.json()).resolves.toEqual({
            error: { code: "AUTH_INVALID_TOKEN" },
        });
        expect(lookupProviderMock).not.toHaveBeenCalled();
    });

    it.each(["password", "google.com", "custom"])(
        "responde 403 AUTH_SIGN_IN_METHOD_DISABLED para token de %s",
        async (provider) => {
            getIdTokenSessionMock.mockResolvedValue(
                sessionSignedInWith(provider)
            );

            const response = await POST(githubRequest());

            expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
            await expect(response.json()).resolves.toEqual({
                error: { code: "AUTH_SIGN_IN_METHOD_DISABLED" },
            });
            expect(lookupProviderMock).not.toHaveBeenCalled();
            expect(createMock).not.toHaveBeenCalled();
        }
    );

    it.each([
        ["o lookup não traz o GitHub", null],
        ["falta o screenName", { ...PROVIDER_INFO, screenName: undefined }],
        [
            "o screenName não é um login do GitHub",
            { ...PROVIDER_INFO, screenName: "-bad" },
        ],
        ["o rawId diverge da claim", { ...PROVIDER_INFO, rawId: "999" }],
    ])(
        "responde 502 AUTH_GITHUB_PROFILE_UNAVAILABLE quando %s, sem criar perfil",
        async (_label, info) => {
            findByReferenceIdMock.mockResolvedValue(null);
            lookupProviderMock.mockResolvedValue(info);

            const response = await POST(githubRequest());

            expect(response.status).toBe(HTTP_STATUS.BAD_GATEWAY);
            await expect(response.json()).resolves.toEqual({
                error: { code: "AUTH_GITHUB_PROFILE_UNAVAILABLE" },
            });
            expect(createMock).not.toHaveBeenCalled();
            expect(updateMock).not.toHaveBeenCalled();
        }
    );

    it("responde 502 quando a Identity Toolkit falha", async () => {
        lookupProviderMock.mockRejectedValue(
            new FakeIdentityToolkitError("INVALID_ID_TOKEN")
        );

        const response = await POST(githubRequest());

        expect(response.status).toBe(HTTP_STATUS.BAD_GATEWAY);
    });

    it("deixa propagar o erro que não vem da Identity Toolkit", async () => {
        lookupProviderMock.mockRejectedValue(new Error("network down"));

        await expect(POST(githubRequest())).rejects.toThrow("network down");
    });

    it("responde 404 USERS_NOT_FOUND quando o único perfil está arquivado", async () => {
        findByReferenceIdMock.mockResolvedValue(null);
        hasArchivedProfileMock.mockResolvedValue(true);

        const response = await POST(githubRequest());

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        await expect(response.json()).resolves.toEqual({
            error: { code: "USERS_NOT_FOUND" },
        });
        expect(createMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
    });
});
