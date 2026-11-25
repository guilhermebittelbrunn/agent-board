import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useParams: () => ({ locale: "pt-br" }),
}));

async function navRoutes() {
    vi.resetModules();
    const { useCommonNavRoutes } = await import(
        "@/app/[locale]/(authenticated)/(common)/routes"
    );
    const { result } = renderHook(() => useCommonNavRoutes());
    return result.current;
}

async function settingsItems() {
    const settings = (await navRoutes()).find((item) => "items" in item);
    return settings && "items" in settings ? settings.items : [];
}

describe("useCommonNavRoutes", () => {
    it("leva a cada seção da conta", async () => {
        expect((await settingsItems()).map((item) => item.url)).toEqual([
            "/pt-br/account?tab=profile",
            "/pt-br/account?tab=security",
            "/pt-br/account?tab=preferences",
        ]);
    });

    it("usa o mesmo rótulo das seções da conta", async () => {
        const { getDictionaryForLocale } = await import(
            "@repo/internationalization/client"
        );
        const accountTabs =
            getDictionaryForLocale("pt-br").dictionary.apps.app.pages.common
                .account.tabs;

        expect((await settingsItems()).map((item) => item.title)).toEqual([
            accountTabs.profile,
            accountTabs.security,
            accountTabs.preferences,
        ]);
        expect(accountTabs.profile).toBe("Perfil");
    });
});
