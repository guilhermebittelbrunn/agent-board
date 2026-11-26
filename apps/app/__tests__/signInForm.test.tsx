import { getDictionaryForLocale } from "@repo/internationalization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, signInWithGithubMock } = vi.hoisted(() => ({
    envMock: {
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: undefined as
            | string
            | undefined,
    },
    signInWithGithubMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: envMock }));

vi.mock("@repo/auth/provider", async () => {
    const { useMutation } = await import("@tanstack/react-query");
    return {
        default: () => ({
            loading: false,
            user: null,
            signIn: useMutation({ mutationFn: vi.fn() }),
        }),
    };
});

vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        errorAlert: vi.fn(),
        infoAlert: vi.fn(),
        successAlert: vi.fn(),
        warningAlert: vi.fn(),
    }),
}));

vi.mock("next/navigation", () => ({
    useParams: () => ({ locale: "pt-br" }),
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: { setAuthorizationHeader: vi.fn() },
}));

vi.mock("@/shared/lib/githubSignInApi", () => ({
    signInWithGithubViaApi: (...args: unknown[]) =>
        signInWithGithubMock(...args),
}));

vi.mock("@/shared/lib/postLoginNavigation", () => ({
    resolveAppPostLoginPath: vi.fn(),
}));

const { LocaleProvider } = await import("@repo/internationalization/client");
const { SignInForm } = await import(
    "@/app/[locale]/(unauthenticated)/sign-in/components/SignInForm"
);

const signInCopy =
    getDictionaryForLocale("pt-br").dictionary.apps.app.pages.signIn;

function renderForm() {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    render(
        <QueryClientProvider client={queryClient}>
            <LocaleProvider>
                <SignInForm />
            </LocaleProvider>
        </QueryClientProvider>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = undefined;
    signInWithGithubMock.mockReturnValue(new Promise(() => null));
});

afterEach(() => {
    cleanup();
});

describe("SignInForm fora do emulador", () => {
    it.each([
        ["ausente", undefined],
        ["vazio", ""],
    ])("mostra só o GitHub com o host do emulador %s", (_label, host) => {
        envMock.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = host;

        renderForm();

        expect(
            screen.getByRole("button", { name: signInCopy.githubSignIn })
        ).toBeTruthy();
        expect(screen.getByText(signInCopy.permissionNote)).toBeTruthy();
        expect(screen.getByText(signInCopy.tokenNote)).toBeTruthy();
        expect(screen.queryByText(signInCopy.emulatorAccess)).toBeNull();
        expect(document.querySelector('input[name="email"]')).toBeNull();
        expect(document.querySelector('input[name="password"]')).toBeNull();
    });

    it("dispara o login do GitHub ao clicar no botão", async () => {
        renderForm();

        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: signInCopy.githubSignIn })
            );
            await Promise.resolve();
        });

        expect(signInWithGithubMock).toHaveBeenCalledTimes(1);
    });
});

describe("SignInForm no emulador", () => {
    it("mostra o GitHub e, separado, o formulário de teste", () => {
        envMock.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

        renderForm();

        expect(
            screen.getByRole("button", { name: signInCopy.githubSignIn })
        ).toBeTruthy();
        expect(screen.getByText(signInCopy.emulatorAccess)).toBeTruthy();
        expect(screen.getByLabelText(signInCopy.form.email)).toBeTruthy();
        expect(screen.getByLabelText(signInCopy.form.password)).toBeTruthy();
    });
});
