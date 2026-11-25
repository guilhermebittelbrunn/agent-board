import { expect, type Page, test } from "@playwright/test";
import { LOCALE, ptBr } from "../support/dictionary";
import { AUTH_STATE } from "../support/paths";

test.use({ storageState: AUTH_STATE.common });

const accountCopy = ptBr.apps.app.pages.common.account;
const accountPath = `/${LOCALE}/account`;

const expectQueryParam = async (page: Page, key: string, value: string) => {
    await expect
        .poll(() => new URL(page.url()).searchParams.get(key))
        .toBe(value);
};

// The section is derived from the URL on every render. These checks need the real Next
// router: a tab click rewrites the URL through the History API, and a sidebar link is a
// client navigation, and both must reach useSearchParams without a reload.
test("the account section follows the URL, the sidebar and the tabs", async ({
    page,
}) => {
    await page.goto(`${accountPath}?tab=security`);
    await expect(
        page.getByRole("heading", { level: 1, name: accountCopy.title })
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { level: 2, name: accountCopy.tabs.security })
    ).toBeVisible();

    const sidebarProfileLink = page.getByRole("link", {
        name: accountCopy.tabs.profile,
        exact: true,
    });
    await sidebarProfileLink.click();
    await expectQueryParam(page, "tab", "profile");
    await expect(
        page.getByRole("heading", { level: 2, name: accountCopy.tabs.profile })
    ).toBeVisible();
    await expect(sidebarProfileLink).toHaveAttribute("aria-current", "page");

    await page
        .getByRole("tablist", { name: accountCopy.sectionNav.label })
        .getByRole("tab", { name: accountCopy.tabs.preferences })
        .click();
    await expectQueryParam(page, "tab", "preferences");
    await expect(
        page.getByRole("heading", {
            level: 2,
            name: accountCopy.tabs.preferences,
        })
    ).toBeVisible();
    await expect(
        page.getByRole("link", {
            name: accountCopy.tabs.preferences,
            exact: true,
        })
    ).toHaveAttribute("aria-current", "page");
});

test("a link without a section lands on the profile", async ({ page }) => {
    await page.goto(accountPath);

    await expectQueryParam(page, "tab", "profile");
    await expect(
        page.getByRole("heading", { level: 2, name: accountCopy.tabs.profile })
    ).toBeVisible();
});

test("a removed section lands on the profile and keeps the other parameters", async ({
    page,
}) => {
    await page.goto(`${accountPath}?tab=billing&from=menu`);

    await expect(
        page
            .getByRole("tablist", { name: accountCopy.sectionNav.label })
            .getByRole("tab", { name: accountCopy.tabs.profile })
    ).toHaveAttribute("aria-selected", "true");
    await expectQueryParam(page, "tab", "profile");
    await expectQueryParam(page, "from", "menu");
});
