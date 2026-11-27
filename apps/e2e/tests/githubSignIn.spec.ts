import { expect, type Page, test } from "@playwright/test";
import { LOCALE, ptBr } from "../support/dictionary";
import { signInPath } from "../support/signIn";
import { APP_URL } from "../support/urls";

const signInCopy = ptBr.apps.app.pages.signIn;
const profileDropdownCopy = ptBr.apps.app.shared.profileDropdown;
const apiErrors = ptBr.packages.utils.apiErrors;

/**
 * The Auth emulator serves its own account picker in the popup. These ids come from the
 * HTML of firebase-tools (pinned in the root package.json) and change with its version;
 * the picker has no labels to select by.
 */
const emulatorPopup = {
    addAccount: (popup: Page) =>
        popup.getByRole("button", { name: "Add new account" }),
    email: (popup: Page) => popup.locator("#email-input"),
    displayName: (popup: Page) => popup.locator("#display-name-input"),
    screenName: (popup: Page) => popup.locator("#screen-name-input"),
    submit: (popup: Page) => popup.locator("#sign-in"),
};

async function signInThroughEmulatorPopup(
    page: Page,
    account: { email: string; displayName: string; screenName: string }
) {
    await page.goto(signInPath);
    const popupOpened = page.waitForEvent("popup");
    await page.getByRole("button", { name: signInCopy.githubSignIn }).click();
    const popup = await popupOpened;
    // The picker wires its buttons once the page has loaded; a click before that is lost
    // and the account form never opens.
    await popup.waitForLoadState();

    await emulatorPopup.addAccount(popup).click();
    await emulatorPopup.email(popup).fill(account.email);
    await emulatorPopup.displayName(popup).fill(account.displayName);
    await emulatorPopup.screenName(popup).fill(account.screenName);
    await emulatorPopup.submit(popup).click();
}

const uniqueEmail = (label: string) => `gh-${label}-${Date.now()}@example.com`;

test("signing in with GitHub through the emulator popup shows the GitHub login", async ({
    page,
}) => {
    await signInThroughEmulatorPopup(page, {
        email: uniqueEmail("e2e"),
        displayName: "E2E Octocat",
        screenName: "e2e-octocat",
    });

    await expect(page).toHaveURL(`${APP_URL}/${LOCALE}/boards`);
    // The sign-in screen lands here with a full page load, and a click on the trigger
    // before hydration does not open the menu.
    await expect(async () => {
        await page
            .getByRole("button", { name: profileDropdownCopy.triggerLabel })
            .click();
        await expect(page.getByText("@e2e-octocat")).toBeVisible({
            timeout: 5000,
        });
    }).toPass();
});

test("a screen name that is not a GitHub login keeps the user on sign-in", async ({
    page,
}) => {
    await signInThroughEmulatorPopup(page, {
        email: uniqueEmail("bad"),
        displayName: "Bad Login",
        screenName: "-bad",
    });

    await expect(
        page.getByText(apiErrors.AUTH_GITHUB_PROFILE_UNAVAILABLE)
    ).toBeVisible();
    await expect(page).toHaveURL(`${APP_URL}${signInPath}`);
    // The auth provider may finish writing the cookie from the popup after the API has
    // refused the account, and only then deletes it.
    await expect
        .poll(async () =>
            (await page.context().cookies()).some(
                (cookie) => cookie.name === "access-token"
            )
        )
        .toBe(false);
});
