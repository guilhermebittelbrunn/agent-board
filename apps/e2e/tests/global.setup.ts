import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, type Page, test as setup } from "@playwright/test";
import { LOCALE } from "../support/dictionary";
import { APPS_ROOT, AUTH_STATE } from "../support/paths";
import { SEED_ACCOUNTS } from "../support/seedAccounts";
import { signInThroughForm } from "../support/signIn";
import { buildStackEnv } from "../support/stackEnv";
import { APP_URL } from "../support/urls";

// `next dev` compiles a route on its first request, which can take longer than any
// assertion budget in the specs. Setup pays that cost once, up front.
const FIRST_COMPILE_TIMEOUT = 300_000;
const WARM_UP_TEST_TIMEOUT = 1_800_000;

// Waiting for "commit" is enough: the compile happens before the server starts
// answering, and the rest of the page load does not need to be paid here.
const compileRoutes = async (page: Page, urls: string[]) => {
    for (const url of urls) {
        await page.goto(url, {
            timeout: FIRST_COMPILE_TIMEOUT,
            waitUntil: "commit",
        });
    }
};

setup.describe.configure({ mode: "serial" });

setup("reset the emulators to the seed", () => {
    // Runs the script directly instead of `pnpm --filter api seed`, whose
    // --env-file-if-exists would load the local apps/api/.env.
    execFileSync(process.execPath, ["scripts/seed-emulator.mjs"], {
        cwd: path.join(APPS_ROOT, "api"),
        env: { ...process.env, ...buildStackEnv("api") },
        stdio: "pipe",
    });
});

setup("sign in as the common user", async ({ page }) => {
    setup.setTimeout(WARM_UP_TEST_TIMEOUT);
    await signInThroughForm(page, SEED_ACCOUNTS.common);
    await expect(page).toHaveURL(`${APP_URL}/${LOCALE}/boards`, {
        timeout: FIRST_COMPILE_TIMEOUT,
    });
    await page
        .context()
        .storageState({ path: AUTH_STATE.common, indexedDB: true });

    await compileRoutes(page, [`/${LOCALE}/account`, `/${LOCALE}/boards/new`]);
});
