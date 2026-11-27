import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectAccessible } from "../support/a11y";
import { LOCALE, ptBr } from "../support/dictionary";
import { AUTH_STATE } from "../support/paths";

type DarkRoute = {
    route: string;
    url: string;
    ready: (page: Page) => Locator;
};

const appCopy = ptBr.apps.app.pages;

const checkInDark = (routes: DarkRoute[]) => {
    for (const { route, url, ready } of routes) {
        test(`${route} has no serious violation in dark mode`, async ({
            page,
        }, testInfo) => {
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await expect(ready(page)).toBeVisible();
            await expectAccessible(page, testInfo, { route });
        });
    }
};

test.use({ colorScheme: "dark" });

test.describe("signed out", () => {
    checkInDark([
        {
            route: `/${LOCALE}`,
            url: `/${LOCALE}`,
            ready: (page) =>
                page.getByRole("link", { name: appCopy.landing.signIn }),
        },
        {
            route: `/${LOCALE}/sign-in`,
            url: `/${LOCALE}/sign-in`,
            ready: (page) => page.getByLabel(appCopy.signIn.form.email),
        },
    ]);
});

test.describe("as a common user", () => {
    test.use({ storageState: AUTH_STATE.common });

    checkInDark([
        {
            route: `/${LOCALE}/boards`,
            url: `/${LOCALE}/boards`,
            ready: (page) => page.getByRole("heading", { level: 1 }),
        },
        ...["profile", "preferences"].map((tab) => ({
            route: `/${LOCALE}/account?tab=${tab}`,
            url: `/${LOCALE}/account?tab=${tab}`,
            ready: (page: Page) =>
                page.getByRole("heading", {
                    level: 1,
                    name: appCopy.common.account.title,
                }),
        })),
    ]);
});
