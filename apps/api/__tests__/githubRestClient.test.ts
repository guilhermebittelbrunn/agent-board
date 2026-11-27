import { generateKeyPairSync } from "node:crypto";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { createGithubRestClient } from "@/(shared)/lib/github/github-rest-client";

const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
});

const CREDENTIALS = { appId: "12345", privateKey };
const API = "https://api.github.com";
const START = Date.parse("2026-11-25T12:00:00Z");
const HOUR = 3_600_000;
const MINUTE = 60_000;
const SECOND = 1000;
const APP_JWT_AUTHORIZATION = /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/;
const REPO = { installationId: 7, owner: "octo", name: "repo" };

type Route = (url: URL, init: RequestInit) => Response | undefined;

let now = START;
let tokenCount = 0;
let routes: Route[] = [];
const fetchMock = vi.fn((input: string, init: RequestInit) => {
    const url = new URL(input);
    for (const route of routes) {
        try {
            const response = route(url, init);
            if (response) {
                return Promise.resolve(response);
            }
        } catch (error) {
            return Promise.reject(error);
        }
    }
    return Promise.reject(
        new Error(`unexpected request ${init.method} ${input}`)
    );
});

const json = (body: unknown, init: ResponseInit = {}) =>
    Response.json(body, init);

const tokenRoute: Route = (url, init) => {
    if (
        init.method === "POST" &&
        url.pathname ===
            `/app/installations/${REPO.installationId}/access_tokens`
    ) {
        tokenCount++;
        return json(
            {
                token: `token-${tokenCount}`,
                expires_at: new Date(now + HOUR).toISOString(),
            },
            { status: HTTP_STATUS.CREATED }
        );
    }
};

const on =
    (path: string, respond: () => Response): Route =>
    (url) =>
        url.pathname === path ? respond() : undefined;

const authorizationOf = (call: number) =>
    (fetchMock.mock.calls[call][1].headers as Record<string, string>)
        .Authorization;

function client() {
    return createGithubRestClient(CREDENTIALS, {
        permissionCache: createGithubPermissionCache(() => now),
        now: () => now,
    });
}

beforeEach(() => {
    now = START;
    tokenCount = 0;
    routes = [tokenRoute];
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {
        // log lines are asserted where they matter
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("installation token", () => {
    const FILE_PATH = `/repos/${REPO.owner}/${REPO.name}/contents/a.txt`;

    beforeEach(() => {
        routes.push(
            on(FILE_PATH, () =>
                json(
                    { message: "Not Found" },
                    { status: HTTP_STATUS.NOT_FOUND }
                )
            )
        );
    });

    it("is minted with the App JWT and sent as a token", async () => {
        await client().readFile(REPO, "a.txt", "main");

        expect(authorizationOf(0)).toMatch(APP_JWT_AUTHORIZATION);
        expect(authorizationOf(1)).toBe("token token-1");
    });

    it("is reused until a minute before it expires, then renewed", async () => {
        const github = client();

        await github.readFile(REPO, "a.txt", "main");
        now = START + HOUR - MINUTE - SECOND;
        await github.readFile(REPO, "a.txt", "main");
        expect(tokenCount).toBe(1);

        now = START + HOUR - MINUTE;
        await github.readFile(REPO, "a.txt", "main");
        expect(tokenCount).toBe(2);
    });

    it("is minted once for concurrent calls", async () => {
        const github = client();

        await Promise.all([
            github.readFile(REPO, "a.txt", "main"),
            github.readFile(REPO, "a.txt", "main"),
        ]);

        expect(tokenCount).toBe(1);
    });

    it("turns a malformed private key into credentials_rejected", async () => {
        const github = createGithubRestClient(
            { appId: "1", privateKey: "not a key" },
            { now: () => now }
        );

        await expect(
            github.readFile(REPO, "a.txt", "main")
        ).rejects.toMatchObject({ kind: "credentials_rejected" });
        expect(console.warn).toHaveBeenCalledWith(
            "[github] app-credentials-rejected"
        );
    });
});

describe("listInstallationRepositories", () => {
    const repository = (name: string) => ({
        name,
        full_name: `octo/${name}`,
        owner: { login: "octo" },
        default_branch: "main",
        private: false,
    });

    it("walks every installation and follows the next page link", async () => {
        routes.push(
            on("/app/installations", () => json([{ id: REPO.installationId }])),
            (url) => {
                if (url.pathname !== "/installation/repositories") {
                    return;
                }
                if (url.searchParams.get("page") === "2") {
                    return json({ repositories: [repository("two")] });
                }
                return json(
                    { repositories: [repository("one")] },
                    {
                        headers: {
                            link: `<${API}/installation/repositories?per_page=100&page=2>; rel="next", <${API}/installation/repositories?per_page=100&page=2>; rel="last"`,
                        },
                    }
                );
            }
        );

        const repositories = await client().listInstallationRepositories();

        expect(repositories).toEqual([
            {
                installationId: 7,
                owner: "octo",
                name: "one",
                fullName: "octo/one",
                defaultBranch: "main",
                private: false,
            },
            {
                installationId: 7,
                owner: "octo",
                name: "two",
                fullName: "octo/two",
                defaultBranch: "main",
                private: false,
            },
        ]);
        expect(authorizationOf(0)).toMatch(APP_JWT_AUTHORIZATION);
    });

    it("never follows a next link to another host", async () => {
        routes.push(
            on("/app/installations", () => json([{ id: REPO.installationId }])),
            on("/installation/repositories", () =>
                json(
                    { repositories: [repository("one")] },
                    {
                        headers: {
                            link: '<https://evil.example/steal?page=2>; rel="next"',
                        },
                    }
                )
            )
        );

        const repositories = await client().listInstallationRepositories();

        expect(repositories).toHaveLength(1);
        expect(fetchMock.mock.calls.every(([url]) => url.startsWith(API))).toBe(
            true
        );
    });

    it("stops after ten pages and logs the truncation", async () => {
        routes.push((url) => {
            if (url.pathname !== "/app/installations") {
                return;
            }
            const page = Number(url.searchParams.get("page") ?? "1");
            return json([], {
                headers: {
                    link: `<${API}/app/installations?per_page=100&page=${page + 1}>; rel="next"`,
                },
            });
        });

        const repositories = await client().listInstallationRepositories();

        expect(repositories).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(10);
        expect(console.warn).toHaveBeenCalledWith(
            "[github] pagination-truncated maxItems=1000"
        );
    });
});

describe("readFile", () => {
    const path = `/repos/${REPO.owner}/${REPO.name}/contents/.kanban/board.yml`;

    it("decodes the base64 content and keeps the sha", async () => {
        routes.push(
            on(path, () =>
                json({
                    type: "file",
                    encoding: "base64",
                    content: Buffer.from("version: 1\nname: é\n").toString(
                        "base64"
                    ),
                    sha: "abc123",
                })
            )
        );

        expect(
            await client().readFile(REPO, ".kanban/board.yml", "main")
        ).toEqual({ content: "version: 1\nname: é\n", sha: "abc123" });
        expect(fetchMock.mock.calls[1][0]).toBe(`${API}${path}?ref=main`);
    });

    it("answers null for a missing file and for a directory", async () => {
        routes.push(
            on(path, () =>
                json(
                    { message: "Not Found" },
                    { status: HTTP_STATUS.NOT_FOUND }
                )
            )
        );
        expect(
            await client().readFile(REPO, ".kanban/board.yml", "main")
        ).toBeNull();

        routes.unshift(on(path, () => json([{ type: "file", name: "x" }])));
        expect(
            await client().readFile(REPO, ".kanban/board.yml", "main")
        ).toBeNull();
    });
});

describe("getCollaboratorRole", () => {
    const path = `/repos/${REPO.owner}/${REPO.name}/collaborators/octocat/permission`;

    it.each([
        [{ permission: "write", role_name: "maintain" }, "maintain"],
        [{ permission: "read", role_name: "triage" }, "triage"],
        [{ permission: "admin", role_name: "admin" }, "admin"],
        [{ permission: "write", role_name: "custom-deployer" }, "write"],
        [{ permission: "read" }, "read"],
    ])("maps %o to %s", async (body, role) => {
        routes.push(on(path, () => json(body)));

        expect(await client().getCollaboratorRole(REPO, "octocat")).toBe(role);
    });

    it("answers none for someone who is not a collaborator", async () => {
        routes.push(
            on(path, () =>
                json(
                    { message: "Not Found" },
                    { status: HTTP_STATUS.NOT_FOUND }
                )
            )
        );

        expect(await client().getCollaboratorRole(REPO, "octocat")).toBe(
            "none"
        );
    });

    it("serves a repeated question from the cache", async () => {
        routes.push(
            on(path, () => json({ permission: "write", role_name: "write" }))
        );
        const github = client();

        await github.getCollaboratorRole(REPO, "octocat");
        await github.getCollaboratorRole(REPO, "OctoCat");

        expect(
            fetchMock.mock.calls.filter(([url]) => url.endsWith("/permission"))
        ).toHaveLength(1);
    });
});

describe("errors", () => {
    const path = `/repos/${REPO.owner}/${REPO.name}/collaborators/octocat/permission`;

    it.each([
        [
            HTTP_STATUS.FORBIDDEN,
            { "x-ratelimit-remaining": "0" },
            "rate_limited",
        ],
        [
            HTTP_STATUS.TOO_MANY_REQUESTS,
            { "retry-after": "60" },
            "rate_limited",
        ],
        [HTTP_STATUS.FORBIDDEN, {}, "not_found"],
        [HTTP_STATUS.UNAUTHORIZED, {}, "credentials_rejected"],
        [HTTP_STATUS.INTERNAL_SERVER_ERROR, {}, "unavailable"],
        [HTTP_STATUS.BAD_GATEWAY, {}, "unavailable"],
    ])("classifies %i %o as %s", async (status, headers, kind) => {
        routes.push(
            on(path, () => json({ message: "x" }, { status, headers }))
        );

        await expect(
            client().getCollaboratorRole(REPO, "octocat")
        ).rejects.toMatchObject({ kind });
    });

    it("logs a rejected App credential without the key", async () => {
        routes.unshift(
            on(`/app/installations/${REPO.installationId}/access_tokens`, () =>
                json(
                    { message: "Bad credentials" },
                    { status: HTTP_STATUS.UNAUTHORIZED }
                )
            )
        );

        await expect(
            client().readFile(REPO, "a.txt", "main")
        ).rejects.toMatchObject({ kind: "credentials_rejected" });
        expect(console.warn).toHaveBeenCalledWith(
            "[github] app-credentials-rejected"
        );
        expect(
            JSON.stringify(vi.mocked(console.warn).mock.calls)
        ).not.toContain("PRIVATE KEY");
    });

    it("turns a network failure into unavailable", async () => {
        routes.push(
            on(path, () => {
                throw new TypeError("fetch failed");
            })
        );

        await expect(
            client().getCollaboratorRole(REPO, "octocat")
        ).rejects.toMatchObject({ kind: "unavailable" });
    });

    it("turns an unexpected body into unavailable", async () => {
        routes.push(on(path, () => json({ permission: "owner" })));

        await expect(
            client().getCollaboratorRole(REPO, "octocat")
        ).rejects.toMatchObject({ kind: "unavailable" });
    });
});

describe("pull requests", () => {
    const PULLS = `/repos/${REPO.owner}/${REPO.name}/pulls`;
    const INPUT = {
        head: "feat/login",
        base: "main",
        title: "Login",
        body: "Summary",
        draft: true,
    };
    const PULL = {
        number: 12,
        html_url: "https://github.com/octo/repo/pull/12",
        title: "Login",
        draft: true,
        head: { ref: "feat/login", sha: "abc" },
        base: { ref: "main" },
        commits: 3,
    };

    it("creates with a JSON body and reads the answer", async () => {
        routes.push(
            on(PULLS, () => json(PULL, { status: HTTP_STATUS.CREATED }))
        );

        const created = await client().createPullRequest(REPO, INPUT);

        const [, init] = fetchMock.mock.calls[1];
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual(INPUT);
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
            "application/json"
        );
        expect(created).toEqual({
            number: 12,
            url: PULL.html_url,
            title: "Login",
            draft: true,
            headRef: "feat/login",
            baseRef: "main",
            headSha: "abc",
            commits: 3,
        });
    });

    it.each([
        [{ status: HTTP_STATUS.FORBIDDEN }, "permission_denied"],
        [{ status: HTTP_STATUS.UNPROCESSABLE_ENTITY }, "unprocessable"],
        [
            {
                status: HTTP_STATUS.FORBIDDEN,
                headers: { "x-ratelimit-remaining": "0" },
            },
            "rate_limited",
        ],
    ])("turns a refused creation %o into %s", async (init, kind) => {
        routes.push(on(PULLS, () => json({ message: "no" }, init)));

        await expect(
            client().createPullRequest(REPO, INPUT)
        ).rejects.toMatchObject({ kind });
    });

    it("looks up the open pull request of owner:branch", async () => {
        routes.push(on(PULLS, () => json([PULL])));

        const found = await client().findOpenPullRequest(REPO, "feat/login");

        const url = new URL(fetchMock.mock.calls[1][0]);
        expect(url.searchParams.get("head")).toBe("octo:feat/login");
        expect(url.searchParams.get("state")).toBe("open");
        expect(found?.number).toBe(PULL.number);
    });

    it("answers null without an open pull request", async () => {
        routes.push(on(PULLS, () => json([])));

        expect(
            await client().findOpenPullRequest(REPO, "feat/none")
        ).toBeNull();
    });
});
