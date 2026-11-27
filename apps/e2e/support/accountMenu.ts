import { expect, type Page } from "@playwright/test";
import { ptBr } from "./dictionary";

const profileDropdownCopy = ptBr.apps.app.shared.profileDropdown;
const accountTabsCopy = ptBr.apps.app.pages.common.account.tabs;
const MENU_OPEN_TIMEOUT = 30_000;
const MENU_RETRY_TIMEOUT = 2000;

/** Opens the avatar menu in the header and follows one of the account entries. */
export async function openAccountFromMenu(
    page: Page,
    section: keyof typeof accountTabsCopy
) {
    const item = page.getByRole("menuitem", { name: accountTabsCopy[section] });
    // A click on the trigger before the header hydrates does nothing, so it is pressed
    // again while the menu is still closed.
    await expect(async () => {
        if (!(await item.isVisible())) {
            await page
                .getByRole("button", { name: profileDropdownCopy.triggerLabel })
                .click();
        }
        await expect(item).toBeVisible({ timeout: MENU_RETRY_TIMEOUT });
    }).toPass({ timeout: MENU_OPEN_TIMEOUT });
    await item.click();
}
