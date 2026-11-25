import type { AccountDTO } from "@repo/sdk/src/types";

export const PASSWORD_PROVIDER_ID = "password";

/** An account still loading answers `true`, so a missing answer never shows the wrong block. */
export function hasSignInMethod(
    account: AccountDTO | undefined,
    providerId: string
): boolean {
    const providers = account?.providerData;
    if (!providers) {
        return true;
    }
    return providers.some((provider) => provider.providerId === providerId);
}

/**
 * Flows that confirm identity by re-entering the password have nothing to ask for on an
 * account that signs in only through another provider.
 */
export const lacksPasswordProvider = (account: AccountDTO | undefined) =>
    !hasSignInMethod(account, PASSWORD_PROVIDER_ID);
