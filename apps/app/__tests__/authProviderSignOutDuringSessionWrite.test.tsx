import { LocaleProvider } from "@repo/internationalization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { idTokenListener, params } = vi.hoisted(() => ({
    idTokenListener: { current: null as ((user: User | null) => void) | null },
    params: { locale: "pt-br" } as Record<string, string>,
}));

vi.mock("@repo/auth/client", () => ({
    loginWithCustomToken: vi.fn(),
    logout: vi.fn(),
    signIn: vi.fn(),
    subscribeToIdTokenState: (listener: (user: User | null) => void) => {
        idTokenListener.current = listener;
        return vi.fn();
    },
}));

vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        errorAlert: vi.fn(),
        infoAlert: vi.fn(),
        successAlert: vi.fn(),
        warningAlert: vi.fn(),
    }),
}));

vi.mock("next/navigation", () => ({
    useParams: () => params,
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../packages/auth/node_modules/next/navigation.js", () => ({
    useParams: () => params,
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

const { AuthProvider } = await import("@repo/auth/provider");

const STATUS_OK = 200;
const STATUS_UNAUTHORIZED = 401;
const SESSION_PATH = "/api/auth/session";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status < STATUS_UNAUTHORIZED,
        status,
        json: () => Promise.resolve(body),
    } as Response;
}

function firebaseUser(): User {
    return { getIdToken: () => Promise.resolve("id-token") } as unknown as User;
}

/** The cookie write stays pending until the test releases it. */
function holdSessionWrite(): () => void {
    let release: (() => void) | undefined;
    const pendingWrite = new Promise<Response>((resolve) => {
        release = () => resolve(jsonResponse(STATUS_OK, { ok: true }));
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/api/auth/session/refresh")) {
            return Promise.resolve(
                jsonResponse(STATUS_UNAUTHORIZED, {
                    error: { code: "AUTH_NO_SESSION" },
                })
            );
        }
        if (url.endsWith(SESSION_PATH) && init?.method === "POST") {
            return pendingWrite;
        }
        return Promise.resolve(jsonResponse(STATUS_OK, { ok: true }));
    });
    return () => release?.();
}

const sessionCalls = (method: string) =>
    fetchMock.mock.calls.filter(
        ([url, init]) =>
            String(url).endsWith(SESSION_PATH) && init?.method === method
    );

function renderProvider() {
    const queryClient = new QueryClient({
        defaultOptions: {
            mutations: { retry: false },
            queries: { retry: false },
        },
    });
    render(
        <LocaleProvider>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>{null}</AuthProvider>
            </QueryClientProvider>
        </LocaleProvider>
    );
}

beforeEach(() => {
    cleanup();
    fetchMock.mockReset();
    idTokenListener.current = null;
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AuthProvider quando o usuário sai enquanto o cookie é gravado", () => {
    it("apaga o cookie que a gravação em voo deixaria para trás", async () => {
        const releaseWrite = holdSessionWrite();
        renderProvider();

        act(() => idTokenListener.current?.(firebaseUser()));
        await waitFor(() => expect(sessionCalls("POST")).toHaveLength(1));

        act(() => idTokenListener.current?.(null));
        expect(sessionCalls("DELETE")).toHaveLength(0);

        await act(async () => {
            releaseWrite();
            await Promise.resolve();
        });

        await waitFor(() => expect(sessionCalls("DELETE")).toHaveLength(1));
    });

    it("mantém o cookie quando o usuário continua conectado", async () => {
        const releaseWrite = holdSessionWrite();
        renderProvider();

        act(() => idTokenListener.current?.(firebaseUser()));
        await waitFor(() => expect(sessionCalls("POST")).toHaveLength(1));

        await act(async () => {
            releaseWrite();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(sessionCalls("DELETE")).toHaveLength(0);
    });
});
