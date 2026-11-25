import type { AccountDTO } from "@repo/sdk/src/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { panelMock, signOutMutateMock, changePasswordMutateMock } = vi.hoisted(
    () => ({
        panelMock: vi.fn(),
        signOutMutateMock: vi.fn(),
        changePasswordMutateMock: vi.fn(),
    })
);

vi.mock("@/shared/providers/AuthRequestPanelContext", () => ({
    useAuthRequestPanel: () => panelMock(),
}));

vi.mock("@repo/auth/provider", () => ({
    default: () => ({ signOut: { mutate: signOutMutateMock } }),
}));

vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/account/(hooks)/useAccountMutations",
    () => ({
        useAccountMutations: () => ({
            changePasswordMutation: {
                mutate: changePasswordMutateMock,
                isPending: false,
            },
        }),
    })
);

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
    useParams: () => ({ locale: "pt-br" }),
}));

const { AccountSecurityForm } = await import(
    "@/app/[locale]/(authenticated)/(common)/(pages)/account/(components)/AccountSecurityForm"
);
const { globalTranslations } = await import(
    "@repo/internationalization/translations/global"
);

const accountSecurity =
    globalTranslations["pt-br"].apps.app.pages.common.account.security;

function accountWith(...providerIds: string[]): AccountDTO {
    return {
        providerData: providerIds.map((providerId) => ({
            providerId,
            uid: `${providerId}-uid`,
            displayName: null,
            email: "owner@example.com",
            phoneNumber: null,
        })),
    } as unknown as AccountDTO;
}

const PASSWORD_ACCOUNT = accountWith("password");
const GOOGLE_ONLY_ACCOUNT = accountWith("google.com");

beforeEach(() => {
    vi.clearAllMocks();
    panelMock.mockReturnValue({ isImpersonating: false });
});

afterEach(cleanup);

describe("AccountSecurityForm — troca de senha", () => {
    function fillPasswords(
        container: HTMLElement,
        values: Record<string, string>
    ) {
        for (const [name, value] of Object.entries(values)) {
            const field = container.querySelector(`input[name="${name}"]`);
            if (!field) {
                throw new Error(`o campo ${name} não foi renderizado`);
            }
            fireEvent.change(field, { target: { value } });
        }
    }

    it("não envia a troca quando a confirmação não bate", async () => {
        const { container } = render(
            <AccountSecurityForm account={PASSWORD_ACCOUNT} />
        );
        fillPasswords(container, {
            currentPassword: "current-secret",
            password: "brand-new-secret",
            confirmPassword: "another-secret",
        });

        fireEvent.click(
            screen.getByRole("button", { name: accountSecurity.save })
        );
        await screen.findByText(accountSecurity.validation.mismatch);

        expect(changePasswordMutateMock).not.toHaveBeenCalled();
    });

    it("envia apenas a senha atual e a nova, nunca a confirmação", async () => {
        const { container } = render(
            <AccountSecurityForm account={PASSWORD_ACCOUNT} />
        );
        fillPasswords(container, {
            currentPassword: "current-secret",
            password: "brand-new-secret",
            confirmPassword: "brand-new-secret",
        });

        fireEvent.click(
            screen.getByRole("button", { name: accountSecurity.save })
        );
        await vi.waitFor(() =>
            expect(changePasswordMutateMock).toHaveBeenCalledTimes(1)
        );

        expect(changePasswordMutateMock.mock.calls[0]?.[0]).toEqual({
            currentPassword: "current-secret",
            password: "brand-new-secret",
        });
    });
});

describe("AccountSecurityForm — conta sem senha", () => {
    it("explica que não há senha para trocar e esconde o formulário", () => {
        const { container } = render(
            <AccountSecurityForm account={GOOGLE_ONLY_ACCOUNT} />
        );

        expect(
            screen.getByText(accountSecurity.passwordUnavailable)
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: accountSecurity.save })
        ).toBeNull();
        expect(
            container.querySelector('input[name="currentPassword"]')
        ).toBeNull();
    });

    it("com senha, mostra o formulário de troca", () => {
        render(
            <AccountSecurityForm
                account={accountWith("password", "google.com")}
            />
        );

        expect(
            screen.getByRole("button", { name: accountSecurity.save })
        ).toBeTruthy();
    });
});
