import { arcjetKeyState } from "@repo/security/keys";
import { reportRequestError } from "@repo/shared/utils/helpers/requestErrorReporter";
import type { Instrumentation } from "next";
import { parseAllowedOrigins } from "@/(shared)/lib/cors";
import { credentialsKeyState } from "@/(shared)/lib/credentials/credentials-key";
import {
    githubWebhookSecret,
    resolveGithubClientMode,
} from "@/(shared)/lib/github/github-app-config";

/**
 * A key without the Arcjet prefix is read as no key, so the limiter stays off rather than
 * failing every request. That is a configuration mistake, not a choice, hence an error. The
 * value is never logged: whatever was pasted there may be another service's credential.
 */
function warnOnDisabledRateLimit(): void {
    const state = arcjetKeyState(process.env.ARCJET_KEY);

    if (state === "absent") {
        console.warn(
            "[security] rate limiting is DISABLED (no ARCJET_KEY). Mutating routes accept unlimited requests."
        );
        return;
    }

    if (state === "malformed") {
        console.error(
            '[security] rate limiting is DISABLED (ARCJET_KEY is set but does not start with "ajkey_"). Mutating routes accept unlimited requests.'
        );
    }
}

/**
 * The GitHub App is opt-in until production, so its absence is announced, not fatal:
 * repository reads and the webhook answer `GITHUB_APP_NOT_CONFIGURED` instead.
 */
function warnOnGithubAppMode(): void {
    const variables = {
        GITHUB_APP_ID: process.env.GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    };
    const mode = resolveGithubClientMode(variables);

    if (mode === "fake") {
        console.warn(
            "[github] GitHub App is NOT configured: using the sample repositories of the emulator."
        );
    }
    if (mode === "off") {
        console.warn(
            "[github] GitHub App is NOT configured: repository reads answer GITHUB_APP_NOT_CONFIGURED."
        );
    }
    if (!githubWebhookSecret(variables)) {
        console.warn(
            "[github] GITHUB_WEBHOOK_SECRET is not set: POST /github/webhook answers GITHUB_APP_NOT_CONFIGURED."
        );
    }
}

/**
 * Without a usable key the scheduled task credentials cannot be sealed, so saving one answers
 * `CREDENTIALS_ENCRYPTION_NOT_CONFIGURED`; local runners and triggering stay as they are.
 * The value is never logged.
 */
function warnOnCredentialsKey(): void {
    const { status } = credentialsKeyState({
        CREDENTIALS_ENCRYPTION_KEY: process.env.CREDENTIALS_ENCRYPTION_KEY,
    });

    if (status === "emulator") {
        console.warn(
            "[credentials] CREDENTIALS_ENCRYPTION_KEY is not set: sealing scheduled tasks with the emulator-only key."
        );
    }
    if (status === "absent") {
        console.warn(
            "[credentials] CREDENTIALS_ENCRYPTION_KEY is not set: saving scheduled tasks is switched off."
        );
    }
    if (status === "invalid") {
        console.error(
            "[credentials] CREDENTIALS_ENCRYPTION_KEY is not 32 bytes in base64: saving scheduled tasks is switched off."
        );
    }
}

/**
 * Firestore is this API's database and it is reached with a service account, so a missing
 * credential is a configuration error, not a runtime state to degrade into. `env.ts` cannot
 * cover this: it skips validation in development and is only evaluated by the modules that
 * import it.
 *
 * The same reasoning governs `CORS_ORIGIN`: a build must not demand a production value, but
 * a production process must not start without one — otherwise it accepts no browser at all
 * and the failure surfaces one request at a time. An empty or comma-only list counts as
 * missing, because the proxy would read it as an empty allowlist.
 */
async function prepareServer(): Promise<void> {
    if (
        process.env.NODE_ENV === "production" &&
        parseAllowedOrigins(process.env.CORS_ORIGIN).length === 0
    ) {
        throw new Error(
            "CORS_ORIGIN is required in production: set the comma-separated list of origins allowed to call this API."
        );
    }

    warnOnDisabledRateLimit();
    warnOnGithubAppMode();
    warnOnCredentialsKey();

    const { getFirestoreAdmin } = await import("@repo/auth/server");
    getFirestoreAdmin();
}

export const register = async () => {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { bootOrExit } = await import("./instrumentation-node");
        await bootOrExit(prepareServer);
    }
};

export const onRequestError: Instrumentation.onRequestError =
    reportRequestError;
