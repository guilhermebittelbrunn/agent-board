import { createHash } from "node:crypto";
import type {
    GithubClient,
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
    };
}

export const githubFakeClient = createGithubFakeClient();
