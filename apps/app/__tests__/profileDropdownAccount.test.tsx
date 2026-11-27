import { globalTranslations } from "@repo/internationalization/translations/global";
import { setCookie } from "@repo/shared/utils/helpers/cookies";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, useMyAccountMock } = vi.hoisted(() => ({
    useAuthMock: vi.fn(),
    useMyAccountMock: vi.fn(),
}));

vi.mock("@repo/auth/provider", () => ({ default: () => useAuthMock() }));

vi.mock("@/shared/hooks/useMyAccount", () => ({
    useMyAccount: () => useMyAccountMock(),
}));

const ProfileDropdown = (await import("@/shared/components/ui/ProfileDropdown"))
    .default;

const ONE_HOUR_IN_SECONDS = 3600;

const FIREBASE_USER = {
    displayName: "Bruno do Token",
    email: "token@example.com",
    photoURL: "https://example.com/token.png",
};

beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
        user: FIREBASE_USER,
        signOut: { mutate: vi.fn() },
    });
    useMyAccountMock.mockReturnValue({ data: undefined });
});

afterEach(cleanup);

describe("ProfileDropdown — origem do nome e do avatar", () => {
    it("mostra o nome da conta assim que a API responde", () => {
        useMyAccountMock.mockReturnValue({
            data: {
                displayName: "Ana da Conta",
                email: "conta@example.com",
                avatarUrl: "https://example.com/account.png",
            },
        });

        const { container } = render(<ProfileDropdown />);

        expect(screen.getByText("Ana")).toBeTruthy();
        expect(screen.queryByText("Bruno")).toBeNull();
        expect(
            container
                .querySelector("[data-slot='avatar-image']")
                ?.getAttribute("src") ?? "https://example.com/account.png"
        ).toBe("https://example.com/account.png");
    });

    it("cai no usuário do Firebase enquanto a conta não carregou", () => {
        render(<ProfileDropdown />);

        expect(screen.getByText("Bruno")).toBeTruthy();
    });

    it("usa o prefixo do e-mail quando não há nome em lugar nenhum", () => {
        useAuthMock.mockReturnValue({
            user: { email: "sem-nome@example.com" },
            signOut: { mutate: vi.fn() },
        });

        render(<ProfileDropdown />);

        expect(screen.getByText("sem-nome")).toBeTruthy();
    });

    it("não quebra quando a conta e o usuário do Firebase estão ausentes", () => {
        useAuthMock.mockReturnValue({
            user: null,
            signOut: { mutate: vi.fn() },
        });

        const { container } = render(<ProfileDropdown />);

        expect(container.querySelector("[data-slot='avatar']")).toBeTruthy();
    });

    it("dá nome ao gatilho antes de a conta e o usuário carregarem", () => {
        useAuthMock.mockReturnValue({
            user: null,
            signOut: { mutate: vi.fn() },
        });

        render(<ProfileDropdown />);

        expect(
            screen.getByRole("button", {
                name: globalTranslations["pt-br"].apps.app.shared
                    .profileDropdown.triggerLabel,
            })
        ).toBeTruthy();
    });

    it.each(["pt-br"] as const)(
        "nomeia o gatilho no idioma do cookie x-locale (%s)",
        (locale) => {
            setCookie("x-locale", locale, ONE_HOUR_IN_SECONDS);
            useAuthMock.mockReturnValue({
                user: null,
                signOut: { mutate: vi.fn() },
            });

            try {
                render(<ProfileDropdown />);

                const triggerLabel =
                    globalTranslations[locale].apps.app.shared.profileDropdown
                        .triggerLabel;
                expect(triggerLabel.trim()).not.toBe("");
                expect(
                    screen.getByRole("button", { name: triggerLabel })
                ).toBeTruthy();
            } finally {
                setCookie("x-locale", "", -1);
            }
        }
    );
});

describe("ProfileDropdown — identidade do GitHub", () => {
    function openMenu(): void {
        fireEvent.keyDown(
            screen.getByRole("button", {
                name: globalTranslations["pt-br"].apps.app.shared
                    .profileDropdown.triggerLabel,
            }),
            { key: "Enter" }
        );
    }

    it("mostra o @login no lugar do e-mail quando a conta tem GitHub", () => {
        useMyAccountMock.mockReturnValue({
            data: {
                displayName: "The Octocat",
                email: "octocat@example.com",
                github: {
                    id: "583231",
                    login: "octocat",
                    name: "The Octocat",
                    avatarUrl: null,
                },
            },
        });

        render(<ProfileDropdown />);
        openMenu();

        expect(screen.getByText("@octocat")).toBeTruthy();
        expect(screen.queryByText("octocat@example.com")).toBeNull();
    });

    it("mostra o e-mail quando a conta não tem GitHub", () => {
        useMyAccountMock.mockReturnValue({
            data: { displayName: "Ana da Conta", email: "conta@example.com" },
        });

        render(<ProfileDropdown />);
        openMenu();

        expect(screen.getByText("conta@example.com")).toBeTruthy();
    });
});

describe("ProfileDropdown — itens da conta", () => {
    const pages = globalTranslations["pt-br"].apps.app.pages;

    it("leva Perfil e Preferências à aba certa da conta e oferece Sair", () => {
        render(<ProfileDropdown />);
        fireEvent.keyDown(
            screen.getByRole("button", {
                name: globalTranslations["pt-br"].apps.app.shared
                    .profileDropdown.triggerLabel,
            }),
            { key: "Enter" }
        );

        const profile = screen.getByRole("menuitem", {
            name: pages.common.account.tabs.profile,
        });
        const preferences = screen.getByRole("menuitem", {
            name: pages.common.account.tabs.preferences,
        });

        expect(profile.getAttribute("href")).toBe("/pt-br/account?tab=profile");
        expect(preferences.getAttribute("href")).toBe(
            "/pt-br/account?tab=preferences"
        );
        expect(
            screen.getByRole("menuitem", {
                name: globalTranslations["pt-br"].apps.app.shared
                    .profileDropdown.signOut,
            })
        ).toBeTruthy();
    });
});
