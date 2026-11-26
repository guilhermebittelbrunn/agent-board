import { env } from "@/env";

/**
 * Password sign-in only exists against the Auth emulator (seed, E2E suite, local QA).
 * Read from the public variable because the browser SDK is what signs in, and it only
 * sees that one; the server-only host would show a form the browser cannot use.
 */
export const isEmulatorSignInEnabled = (): boolean =>
    Boolean(env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST);
