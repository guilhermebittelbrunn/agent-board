import { GITHUB_REPO_ROLES, type GithubRepoRole } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { z } from "zod";
import type { GithubAppCredentials } from "./github-app-config";
import { createAppJwt } from "./github-app-jwt";
import type {
    GithubClient,
    GithubFile,
    GithubPullRequest,
    GithubRepository,
    GithubRepositoryRef,
} from "./github-client";
import { GithubApiError } from "./github-errors";
import {
    createInstallationTokenCache,
    type InstallationTokenCache,
} from "./github-installation-tokens";
import {
    type GithubPermissionCache,
    githubPermissionCache,
} from "./github-permission-cache";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 10_000;
const MS_PER_SECOND = 1000;
// GitHub serves at most 100 items per page.
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const NEXT_PAGE_LINK = /<([^>]+)>;\s*rel="next"/;

const installationsSchema = z.array(z.object({ id: z.number().int() }));

const installationRepositoriesSchema = z.object({
    repositories: z.array(
        z.object({
            name: z.string(),
            full_name: z.string(),
            owner: z.object({ login: z.string() }),
            default_branch: z.string(),
            private: z.boolean(),
        })
    ),
});

const accessTokenSchema = z.object({
    token: z.string().min(1),
    expires_at: z.string(),
});

const contentSchema = z.union([
    z.object({
        type: z.literal("file"),
        content: z.string(),
        encoding: z.literal("base64"),
        sha: z.string(),
    }),
    z.object({ type: z.string() }),
    z.array(z.unknown()),
]);

const collaboratorPermissionSchema = z.object({
    permission: z.enum(["admin", "write", "read", "none"]),
    role_name: z.string().optional(),
});

const pullRequestSchema = z.object({
    number: z.number().int(),
    html_url: z.string(),
    title: z.string(),
    draft: z.boolean().optional(),
    head: z.object({ ref: z.string(), sha: z.string() }),
    base: z.object({ ref: z.string() }),
    commits: z.number().int().optional(),
});

const toPullRequest = (
    body: z.infer<typeof pullRequestSchema>
): GithubPullRequest => ({
    number: body.number,
    url: body.html_url,
    title: body.title,
    draft: body.draft ?? false,
    headRef: body.head.ref,
    baseRef: body.base.ref,
    headSha: body.head.sha,
    commits: body.commits ?? null,
});

type Auth = { scheme: "Bearer" | "token"; credential: string };

function isRateLimited(response: Response): boolean {
    return (
        (response.status === HTTP_STATUS.FORBIDDEN ||
            response.status === HTTP_STATUS.TOO_MANY_REQUESTS) &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.has("retry-after"))
    );
}

/**
 * A 403 that is not a quota is GitHub saying the installation cannot reach the resource
 * ("Resource not accessible by integration"), which for the caller is the same as the
 * repository not being there.
 */
function classify(response: Response): GithubApiError {
    if (response.status === HTTP_STATUS.UNAUTHORIZED) {
        logEvent("github", "app-credentials-rejected");
        return new GithubApiError("credentials_rejected", response.status);
    }
    if (isRateLimited(response)) {
        return new GithubApiError("rate_limited", response.status);
    }
    if (
        response.status === HTTP_STATUS.NOT_FOUND ||
        response.status === HTTP_STATUS.FORBIDDEN
    ) {
        return new GithubApiError("not_found", response.status);
    }
    return new GithubApiError("unavailable", response.status);
}

/**
 * On a write, a 403 that is not a quota means the installation lacks the permission (it can
 * read the repository, or the write would be a 404), and a 422 is GitHub refusing the content.
 */
function classifyWrite(response: Response): GithubApiError {
    if (response.status === HTTP_STATUS.FORBIDDEN && !isRateLimited(response)) {
        return new GithubApiError("permission_denied", response.status);
    }
    if (response.status === HTTP_STATUS.UNPROCESSABLE_ENTITY) {
        return new GithubApiError("unprocessable", response.status);
    }
    return classify(response);
}

function nextPageUrl(response: Response): string | null {
    const match = response.headers.get("link")?.match(NEXT_PAGE_LINK);
    if (!match) {
        return null;
    }
    // A token is attached to the next request, so it never leaves GitHub's API host.
    const url = new URL(match[1]);
    return url.origin === GITHUB_API_ORIGIN ? url.toString() : null;
}

const encodeFilePath = (path: string): string =>
    path
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");

const repositoryPath = ({ owner, name }: GithubRepositoryRef): string =>
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

function roleFromPermission(
    permission: z.infer<typeof collaboratorPermissionSchema>
): GithubRepoRole {
    const roleName = permission.role_name as GithubRepoRole | undefined;
    if (roleName && GITHUB_REPO_ROLES.includes(roleName)) {
        return roleName;
    }
    return permission.permission;
}

export type GithubRestClientOptions = {
    permissionCache?: GithubPermissionCache;
    now?: () => number;
};

export function createGithubRestClient(
    credentials: GithubAppCredentials,
    {
        permissionCache = githubPermissionCache,
        now = Date.now,
    }: GithubRestClientOptions = {}
): GithubClient {
    async function send(
        url: string,
        auth: Auth,
        method: "GET" | "POST" = "GET",
        body?: unknown
    ): Promise<Response> {
        let response: Response;
        try {
            response = await fetch(url, {
                method,
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: `${auth.scheme} ${auth.credential}`,
                    "User-Agent": "agent-board",
                    "X-GitHub-Api-Version": GITHUB_API_VERSION,
                    ...(body === undefined
                        ? {}
                        : { "Content-Type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch {
            throw new GithubApiError("unavailable");
        }
        return response;
    }

    async function readJson<T>(
        response: Response,
        schema: z.ZodType<T>
    ): Promise<T> {
        const parsed = schema.safeParse(
            await response.json().catch(() => null)
        );
        if (!parsed.success) {
            throw new GithubApiError("unavailable", response.status);
        }
        return parsed.data;
    }

    // A malformed key makes `sign` throw; it is the same failure as a key GitHub refuses.
    function appAuth(): Auth {
        try {
            return {
                scheme: "Bearer",
                credential: createAppJwt(
                    credentials,
                    Math.floor(now() / MS_PER_SECOND)
                ),
            };
        } catch {
            logEvent("github", "app-credentials-rejected");
            throw new GithubApiError("credentials_rejected");
        }
    }

    const tokens: InstallationTokenCache = createInstallationTokenCache(
        async (installationId) => {
            const response = await send(
                `${GITHUB_API_ORIGIN}/app/installations/${installationId}/access_tokens`,
                appAuth(),
                "POST"
            );
            if (!response.ok) {
                throw classify(response);
            }
            const body = await readJson(response, accessTokenSchema);
            return {
                token: body.token,
                expiresAt: Date.parse(body.expires_at),
            };
        },
        now
    );

    const installationAuth = async (installationId: number): Promise<Auth> => ({
        scheme: "token",
        credential: await tokens.get(installationId),
    });

    async function paginate<T>(
        firstUrl: string,
        auth: () => Auth | Promise<Auth>,
        readPage: (response: Response) => Promise<T[]>
    ): Promise<T[]> {
        const items: T[] = [];
        let url: string | null = firstUrl;
        for (let page = 0; url && page < MAX_PAGES; page++) {
            const response = await send(url, await auth());
            if (!response.ok) {
                throw classify(response);
            }
            items.push(...(await readPage(response)));
            url = nextPageUrl(response);
        }
        if (url) {
            logEvent("github", "pagination-truncated", {
                maxItems: MAX_PAGES * PAGE_SIZE,
            });
        }
        return items;
    }

    return {
        async listInstallationRepositories() {
            const installations = await paginate(
                `${GITHUB_API_ORIGIN}/app/installations?per_page=${PAGE_SIZE}`,
                appAuth,
                (response) => readJson(response, installationsSchema)
            );

            const repositories: GithubRepository[] = [];
            for (const { id: installationId } of installations) {
                const page = await paginate(
                    `${GITHUB_API_ORIGIN}/installation/repositories?per_page=${PAGE_SIZE}`,
                    () => installationAuth(installationId),
                    async (response) =>
                        (
                            await readJson(
                                response,
                                installationRepositoriesSchema
                            )
                        ).repositories
                );
                for (const repository of page) {
                    repositories.push({
                        installationId,
                        owner: repository.owner.login,
                        name: repository.name,
                        fullName: repository.full_name,
                        defaultBranch: repository.default_branch,
                        private: repository.private,
                    });
                }
            }
            return repositories;
        },

        async readFile(repo, path, ref): Promise<GithubFile | null> {
            const response = await send(
                `${GITHUB_API_ORIGIN}${repositoryPath(repo)}/contents/${encodeFilePath(path)}?ref=${encodeURIComponent(ref)}`,
                await installationAuth(repo.installationId)
            );
            if (response.status === HTTP_STATUS.NOT_FOUND) {
                return null;
            }
            if (!response.ok) {
                throw classify(response);
            }
            const body = await readJson(response, contentSchema);
            if (Array.isArray(body) || !("content" in body)) {
                return null;
            }
            return {
                content: Buffer.from(body.content, "base64").toString("utf8"),
                sha: body.sha,
            };
        },

        async getCollaboratorRole(repo, username) {
            const fullName = `${repo.owner}/${repo.name}`;
            const cached = permissionCache.get(fullName, username);
            if (cached) {
                return cached;
            }

            const response = await send(
                `${GITHUB_API_ORIGIN}${repositoryPath(repo)}/collaborators/${encodeURIComponent(username)}/permission`,
                await installationAuth(repo.installationId)
            );
            let role: GithubRepoRole;
            if (response.status === HTTP_STATUS.NOT_FOUND) {
                role = "none";
            } else if (response.ok) {
                role = roleFromPermission(
                    await readJson(response, collaboratorPermissionSchema)
                );
            } else {
                throw classify(response);
            }

            permissionCache.set(fullName, username, role);
            return role;
        },

        async createPullRequest(repo, input) {
            const response = await send(
                `${GITHUB_API_ORIGIN}${repositoryPath(repo)}/pulls`,
                await installationAuth(repo.installationId),
                "POST",
                input
            );
            if (!response.ok) {
                throw classifyWrite(response);
            }
            return toPullRequest(await readJson(response, pullRequestSchema));
        },

        async findOpenPullRequest(repo, head) {
            const query = new URLSearchParams({
                head: `${repo.owner}:${head}`,
                state: "open",
                per_page: "1",
            });
            const response = await send(
                `${GITHUB_API_ORIGIN}${repositoryPath(repo)}/pulls?${query.toString()}`,
                await installationAuth(repo.installationId)
            );
            if (!response.ok) {
                throw classify(response);
            }
            const [first] = await readJson(
                response,
                z.array(pullRequestSchema)
            );
            return first === undefined ? null : toPullRequest(first);
        },
    };
}
