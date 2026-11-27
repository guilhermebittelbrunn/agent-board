import { expect, type Page, test } from "@playwright/test";
import { openAccountFromMenu } from "../support/accountMenu";
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
// router: a tab click rewrites the URL through the History API, and a menu link is a
// client navigation, and both must reach useSearchParams without a reload.
test("the account section follows the avatar menu and the tabs", async ({
    page,
}) => {
    await page.goto(`/${LOCALE}/boards`);

    await openAccountFromMenu(page, "preferences");
    await expectQueryParam(page, "tab", "preferences");
    await expect(
        page.getByRole("heading", { level: 1, name: accountCopy.title })
    ).toBeVisible();
    await expect(
        page.getByRole("heading", {
            level: 2,
            name: accountCopy.tabs.preferences,
        })
    ).toBeVisible();

    await openAccountFromMenu(page, "profile");
    await expectQueryParam(page, "tab", "profile");
    await expect(
        page.getByRole("heading", { level: 2, name: accountCopy.tabs.profile })
    ).toBeVisible();

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
    await page.goto(`${accountPath}?tab=security&from=menu`);

    await expect(
        page
            .getByRole("tablist", { name: accountCopy.sectionNav.label })
            .getByRole("tab", { name: accountCopy.tabs.profile })
    ).toHaveAttribute("aria-selected", "true");
    await expectQueryParam(page, "tab", "profile");
    await expectQueryParam(page, "from", "menu");
});
