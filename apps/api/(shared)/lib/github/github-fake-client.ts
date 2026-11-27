import { createHash } from "node:crypto";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type {
    GithubClient,
    GithubPullRequest,
    GithubRepository,
    GithubRepositoryRef,
} from "./github-client";
import { GithubApiError } from "./github-errors";
import {
    type GithubPermissionCache,
    githubPermissionCache,
} from "./github-permission-cache";
import {
    SAMPLE_COLLABORATOR_ROLES,
    SAMPLE_INSTALLATION_ID,
    SAMPLE_OWNER,
    SAMPLE_REPOSITORIES,
    type SampleRepository,
} from "./github-sample-repositories";

// Same format as a git blob id, so a reload can compare it like the real one.
const blobSha = (content: string): string => {
    const bytes = Buffer.from(content, "utf8");
    return createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
};

// The Promise constructor turns a synchronous throw into a rejection, like the real client.
const settle = <T>(compute: () => T): Promise<T> =>
    new Promise((resolve) => resolve(compute()));

function findSample(repo: GithubRepositoryRef): SampleRepository {
    const sample =
        repo.installationId === SAMPLE_INSTALLATION_ID &&
        repo.owner.toLowerCase() === SAMPLE_OWNER
            ? SAMPLE_REPOSITORIES.find(
                  (candidate) => candidate.name === repo.name.toLowerCase()
              )
            : undefined;
    if (!sample) {
        throw new GithubApiError("not_found");
    }
    return sample;
}

const DRAFT_SPEC_PATH = /^specs\/features\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/**
 * No agent writes on a card branch while the test executor runs, so a spec read there is
 * answered with a proposed draft whose `id` is the slug, the shape an approval expects.
 */
function syntheticDraft(path: string): string | null {
    const slug = DRAFT_SPEC_PATH.exec(path)?.[1];
    if (slug === undefined) {
        return null;
    }
    return [
        "---",
        `id: ${slug}`,
        `title: Spec draft ${slug}`,
        "status: proposed",
        "---",
        "",
        `# Spec draft ${slug}`,
        "",
        "Written by the test executor.",
        "",
    ].join("\n");
}

/** Branches that make the fake refuse the pull request, to exercise the degraded mode. */
export const FAKE_PULL_REQUEST_PERMISSION_BRANCH = "feat/qa-pr-permission";
export const FAKE_PULL_REQUEST_REJECTED_BRANCH = "feat/qa-pr-rejected";
const MAX_FAKE_PULL_REQUEST_NUMBER = 9999;
const HASH_PREFIX_LENGTH = 8;
const HEX_RADIX = 16;
const FAKE_PULL_REQUEST_COMMITS = 3;

const sha1 = (value: string): string =>
    createHash("sha1").update(value).digest("hex");

/**
 * Derived from the branch alone, so every Next.js instance answers the same pull request
 * without sharing state.
 */
function fakePullRequest(
    repo: GithubRepositoryRef,
    sample: SampleRepository,
    input: { head: string; base?: string; title?: string; draft?: boolean }
): GithubPullRequest {
    const number =
        (Number.parseInt(
            sha1(input.head).slice(0, HASH_PREFIX_LENGTH),
            HEX_RADIX
        ) %
            MAX_FAKE_PULL_REQUEST_NUMBER) +
        1;
    return {
        number,
        url: `https://github.com/${SAMPLE_OWNER}/${repo.name.toLowerCase()}/pull/${number}`,
        title: input.title ?? input.head,
        draft: input.draft ?? false,
        headRef: input.head,
        baseRef: input.base ?? sample.defaultBranch,
        headSha: sha1(`head:${input.head}`),
        commits: FAKE_PULL_REQUEST_COMMITS,
    };
}

function refuseReservedBranch(head: string): void {
    if (head === FAKE_PULL_REQUEST_PERMISSION_BRANCH) {
        throw new GithubApiError("permission_denied", HTTP_STATUS.FORBIDDEN);
    }
    if (head === FAKE_PULL_REQUEST_REJECTED_BRANCH) {
        throw new GithubApiError(
            "unprocessable",
            HTTP_STATUS.UNPROCESSABLE_ENTITY
        );
    }
}

/**
 * Stands in for the GitHub App while the API runs against the emulator. The logins in
 * `SAMPLE_COLLABORATOR_ROLES` get their listed permission; everyone else is an admin, so
 * whoever ran the seed can import any sample repository as the board owner.
 */
export function createGithubFakeClient(
    permissionCache: GithubPermissionCache = githubPermissionCache
): GithubClient {
    return {
        listInstallationRepositories() {
            return settle(() =>
                SAMPLE_REPOSITORIES.map(
                    (sample): GithubRepository => ({
                        installationId: SAMPLE_INSTALLATION_ID,
                        owner: SAMPLE_OWNER,
                        name: sample.name,
                        fullName: `${SAMPLE_OWNER}/${sample.name}`,
                        defaultBranch: sample.defaultBranch,
                        private: sample.private,
                    })
                )
            );
        },

        readFile(repo, path, ref) {
            return settle(() => {
                const sample = findSample(repo);
                const content =
                    ref === sample.defaultBranch
                        ? sample.files[path]
                        : syntheticDraft(path);
                if (content === undefined || content === null) {
                    return null;
                }
                return { content, sha: blobSha(content) };
            });
        },

        getCollaboratorRole(repo, username) {
            return settle(() => {
                findSample(repo);
                const fullName = `${repo.owner}/${repo.name}`;
                const cached = permissionCache.get(fullName, username);
                if (cached) {
                    return cached;
                }
                const role =
                    SAMPLE_COLLABORATOR_ROLES[username.toLowerCase()] ??
                    "admin";
                permissionCache.set(fullName, username, role);
                return role;
            });
        },

        createPullRequest(repo, input) {
            return settle(() => {
                const sample = findSample(repo);
                refuseReservedBranch(input.head);
                return fakePullRequest(repo, sample, input);
            });
        },

        findOpenPullRequest(repo, head) {
            return settle(() => {
                const sample = findSample(repo);
                if (
                    head === FAKE_PULL_REQUEST_PERMISSION_BRANCH ||
                    head === FAKE_PULL_REQUEST_REJECTED_BRANCH
                ) {
                    return null;
                }
                return fakePullRequest(repo, sample, { head });
            });
        },
    };
}

export const githubFakeClient = createGithubFakeClient();
