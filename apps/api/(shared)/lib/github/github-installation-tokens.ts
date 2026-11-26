export type InstallationToken = { token: string; expiresAt: number };

const RENEW_BEFORE_EXPIRY_MS = 60_000;

export type InstallationTokenCache = {
    get(installationId: number): Promise<string>;
};

/**
 * One request in flight per installation: two calls arriving together share the same
 * promise instead of each minting a token.
 */
export function createInstallationTokenCache(
    issue: (installationId: number) => Promise<InstallationToken>,
    now: () => number = Date.now
): InstallationTokenCache {
    const tokens = new Map<number, InstallationToken>();
    const pending = new Map<number, Promise<InstallationToken>>();

    return {
        async get(installationId) {
            const cached = tokens.get(installationId);
            if (cached && cached.expiresAt - now() > RENEW_BEFORE_EXPIRY_MS) {
                return cached.token;
            }

            let request = pending.get(installationId);
            if (!request) {
                request = issue(installationId).finally(() =>
                    pending.delete(installationId)
                );
                pending.set(installationId, request);
            }

            const issued = await request;
            tokens.set(installationId, issued);
            return issued.token;
        },
    };
}
