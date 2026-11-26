import { isEmulated } from "./emulator";

/**
 * `custom` is the cross-app session adoption: the server only mints a custom token from a
 * valid session cookie, and that cookie only exists for an accepted method.
 */
const ALWAYS_ACCEPTED = new Set(["github.com", "custom"]);

/** Password accounts are how the seed, the E2E suite and local QA sign in. */
const EMULATOR_ONLY = new Set(["password"]);

/** Reads `firebase.sign_in_provider` from a verified ID token or session cookie. */
export function isAcceptedSignInMethod(provider: string | undefined): boolean {
    if (!provider) {
        return false;
    }
    if (ALWAYS_ACCEPTED.has(provider)) {
        return true;
    }
    return isEmulated() && EMULATOR_ONLY.has(provider);
}
