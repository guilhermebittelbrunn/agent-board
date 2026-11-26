import { isEmulated } from "@repo/auth/emulator";

export type GithubAppCredentials = { appId: string; privateKey: string };

export type GithubClientMode = "app" | "fake" | "off";

/**
 * Takes the variables instead of importing `@/env` so the boot notice in
 * `instrumentation.ts` can read `process.env` without validating every other variable.
 */
export type GithubAppVariables = {
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    GITHUB_WEBHOOK_SECRET?: string;
};

export function githubAppCredentials(
    variables: GithubAppVariables
): GithubAppCredentials | null {
    const appId = variables.GITHUB_APP_ID || null;
    const privateKey = variables.GITHUB_APP_PRIVATE_KEY || null;
    if (!(appId && privateKey)) {
        return null;
    }
    return { appId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

export const githubWebhookSecret = (
    variables: GithubAppVariables
): string | null => variables.GITHUB_WEBHOOK_SECRET || null;

/**
 * The sample client is only ever picked against the emulator: an emulated process talks
 * to a `demo-*` project that has no real user, so no real board can be imported from
 * made-up repositories.
 */
export function resolveGithubClientMode(
    variables: GithubAppVariables
): GithubClientMode {
    if (githubAppCredentials(variables)) {
        return "app";
    }
    return isEmulated() ? "fake" : "off";
}
