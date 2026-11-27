import { describe, expect, it, vi } from "vitest";

async function loadRouting() {
    vi.resetModules();
    return await import(
        "@/app/[locale]/(authenticated)/(common)/(pages)/account/(components)/accountTabRouting"
    );
}

describe("resolveAccountTab", () => {
    it.each(["profile", "preferences"])("aceita a seção %s", async (tab) => {
        const { resolveAccountTab } = await loadRouting();

        expect(resolveAccountTab(tab)).toBe(tab);
    });

    it.each([null, "", "xyz", "PROFILE", "billing", "privacy", "security"])(
        "cai no perfil quando a URL pede %j",
        async (raw) => {
            const { resolveAccountTab } = await loadRouting();

            expect(resolveAccountTab(raw)).toBe("profile");
        }
    );
});

describe("accountTabHref", () => {
    it("troca só o tab e preserva os outros parâmetros", async () => {
        const { accountTabHref } = await loadRouting();
        const current = new URLSearchParams("tab=profile&from=menu");

        const href = accountTabHref("/pt-br/account", current, "preferences");
        const params = new URL(href, "http://localhost").searchParams;

        expect(href.startsWith("/pt-br/account?")).toBe(true);
        expect(params.get("tab")).toBe("preferences");
        expect(params.get("from")).toBe("menu");
    });

    it("acrescenta o tab quando a URL não tem nenhum", async () => {
        const { accountTabHref } = await loadRouting();

        expect(
            accountTabHref("/pt-br/account", new URLSearchParams(""), "profile")
        ).toBe("/pt-br/account?tab=profile");
    });
});
