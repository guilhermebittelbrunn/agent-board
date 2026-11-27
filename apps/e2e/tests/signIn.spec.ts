import { expect, test } from "@playwright/test";
import { expectAccessible } from "../support/a11y";
import { LOCALE, ptBr } from "../support/dictionary";
import { SEED_ACCOUNTS } from "../support/seedAccounts";
import {
    fillSignInForm,
    signInPath,
    signInThroughForm,
} from "../support/signIn";
import { APP_URL } from "../support/urls";

const firebaseErrors = ptBr.packages.auth.provider.firebase.error;
const navbarCopy = ptBr.apps.app.pages.navbar;
const landingCopy = ptBr.apps.app.pages.landing;

const escapeRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The Auth emulator answers a wrong password with INVALID_PASSWORD, while a project with
// email enumeration protection answers INVALID_LOGIN_CREDENTIALS; the SDK maps them to
// different codes, and either translated message is correct.
const wrongPasswordMessage = new RegExp(
    `${escapeRegExp(firebaseErrors["auth/wrong-password"])}|${escapeRegExp(firebaseErrors["auth/invalid-credential"])}`
);

test("the landing leads an anonymous visitor to sign-in", async ({ page }) => {
    await page.goto(`/${LOCALE}`);

    await page.getByRole("link", { name: landingCopy.signIn }).click();

    await expect(page).toHaveURL(`${APP_URL}${signInPath}`);
});

test("a user signs in and lands on the boards", async ({ page }, testInfo) => {
    await page.goto(signInPath);
    await expectAccessible(page, testInfo, { route: signInPath });

    await fillSignInForm(page, SEED_ACCOUNTS.common);

    await expect(page).toHaveURL(`${APP_URL}/${LOCALE}/boards`);
    await expect(
        page.getByRole("link", { name: navbarCopy.homeLinkLabel })
    ).toBeVisible();
});

test("a wrong password keeps the user on sign-in with a translated message", async ({
    page,
}) => {
    await signInThroughForm(page, {
        email: SEED_ACCOUNTS.common.email,
        password: `${SEED_ACCOUNTS.common.password}-wrong`,
    });

    await expect(page.getByText(wrongPasswordMessage)).toBeVisible();
    await expect(page).toHaveURL(`${APP_URL}${signInPath}`);
});

test("a deep link without a session returns to its destination after sign-in", async ({
    page,
}) => {
    const destination = `/${LOCALE}/account?tab=preferences`;

    await page.goto(destination);
    await expect(page).toHaveURL(
        `${APP_URL}${signInPath}?redirect=${encodeURIComponent(destination)}`
    );

    await fillSignInForm(page, SEED_ACCOUNTS.common);

    await expect(page).toHaveURL(`${APP_URL}${destination}`);
});
