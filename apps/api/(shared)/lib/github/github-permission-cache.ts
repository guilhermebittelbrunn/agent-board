import type { GithubRepoRole } from "@repo/kanban-contract";

const PERMISSION_TTL_MS = 300_000;

export type GithubPermissionCache = {
    get(fullName: string, username: string): GithubRepoRole | undefined;
    set(fullName: string, username: string, role: GithubRepoRole): void;
    invalidateRepository(fullName: string): void;
};

// GitHub owner, repository and user names are case-insensitive.
const repositoryPrefix = (fullName: string) => `${fullName.toLowerCase()}#`;
const entryKey = (fullName: string, username: string) =>
    `${repositoryPrefix(fullName)}${username.toLowerCase()}`;

export function createGithubPermissionCache(
    now: () => number = Date.now
): GithubPermissionCache {
    const entries = new Map<
        string,
        { role: GithubRepoRole; expiresAt: number }
    >();

    return {
        get(fullName, username) {
            const key = entryKey(fullName, username);
            const entry = entries.get(key);
            if (!entry) {
                return;
            }
            if (entry.expiresAt <= now()) {
                entries.delete(key);
                return;
            }
            return entry.role;
        },
        set(fullName, username, role) {
            entries.set(entryKey(fullName, username), {
                role,
                expiresAt: now() + PERMISSION_TTL_MS,
            });
        },
        invalidateRepository(fullName) {
            const prefix = repositoryPrefix(fullName);
            for (const key of entries.keys()) {
                if (key.startsWith(prefix)) {
                    entries.delete(key);
                }
            }
        },
    };
}

export const githubPermissionCache = createGithubPermissionCache();
