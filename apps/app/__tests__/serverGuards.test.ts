import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, getServerApiClientMock } = vi.hoisted(() => ({
    redirectMock: vi.fn((path: string) => {
        throw new Error(`redirect:${path}`);
    }),
    getServerApiClientMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/server/apiServerClient", () => ({
    getServerApiClient: () => getServerApiClientMock(),
}));

const LOCALE = "pt-br";

function givenSession(user: { uid: string } | null) {
    if (!user) {
        getServerApiClientMock.mockResolvedValue(null);
        return;
    }
    getServerApiClientMock.mockResolvedValue({
        authApi: { me: () => Promise.resolve(user) },
    });
}

/**
 * `getAppSessionUser` is wrapped in React `cache`: a fresh module per case guarantees the
 * session is resolved again instead of served from a memo.
 */
async function loadGuards() {
    vi.resetModules();
    const { requireSession } = await import("@/lib/server/authSession");
    return { requireSession };
}

beforeEach(() => {
    redirectMock.mockClear();
    getServerApiClientMock.mockReset();
});

describe("requireSession", () => {
    it("redirects an anonymous visitor to sign-in", async () => {
        givenSession(null);
        const { requireSession } = await loadGuards();

        await expect(requireSession(LOCALE)).rejects.toThrow(
            "redirect:/pt-br/sign-in"
        );
        expect(redirectMock).toHaveBeenCalledWith("/pt-br/sign-in");
    });

    it("returns the session user without redirecting", async () => {
        givenSession({ uid: "uid-alice" });
        const { requireSession } = await loadGuards();

        expect(await requireSession(LOCALE)).toEqual({ uid: "uid-alice" });
        expect(redirectMock).not.toHaveBeenCalled();
    });
});
