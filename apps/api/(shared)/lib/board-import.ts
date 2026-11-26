import {
    type GithubRepoRole,
    resolveEffectiveRole,
} from "@repo/kanban-contract";
import {
    type BoardConfigYamlResult,
    parseBoardConfigYaml,
} from "@repo/kanban-contract/board-config-yaml";
import type {
    BoardImportPreviewDTO,
    BoardRawStageDTO,
    BoardRepositoryDTO,
    RepositoryBoardLink,
    UserDTO,
} from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    type GithubClient,
    type GithubFile,
    type GithubRepository,
    getGithubClient,
} from "./github/github-client";
import {
    githubAppNotConfiguredResponse,
    githubErrorResponse,
} from "./github/github-errors";
import { BOARD_CONFIG_PATH } from "./github/github-sample-repositories";
import { mapWithConcurrency } from "./map-with-concurrency";

// biome-ignore lint/performance/noBarrelFile: the routes read the path from the import flow, not from the emulator samples.
export { BOARD_CONFIG_PATH } from "./github/github-sample-repositories";

/** Bounds the role lookups that listing a large installation fires at GitHub at once. */
const ROLE_LOOKUP_CONCURRENCY = 8;

type Refusal = { ok: false; response: Response };

export type ImportTarget =
    | Refusal
    | {
          ok: true;
          client: GithubClient;
          repository: GithubRepository;
          githubRole: GithubRepoRole;
          file: GithubFile | null;
          /** `null` when the file is missing. */
          parsed: BoardConfigYamlResult | null;
      };

const refuse = (code: string, status: number): Refusal => ({
    ok: false,
    response: Response.json({ error: { code } }, { status }),
});

const repositoryNotAccessible = () =>
    refuse("GITHUB_REPOSITORY_NOT_ACCESSIBLE", HTTP_STATUS.NOT_FOUND);

/**
 * Owner and repository names cannot hold two hyphens in a row at the owner side, so the
 * first `--` always splits them back apart, and the id stays one per repository whatever
 * case GitHub returns.
 */
export function boardIdForRepository(fullName: string): string {
    return fullName.toLowerCase().replace("/", "--");
}

export function toBoardRepository(
    repository: GithubRepository
): BoardRepositoryDTO {
    return {
        installationId: repository.installationId,
        owner: repository.owner,
        name: repository.name,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        private: repository.private,
    };
}

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" ? value : null;

/** The stages of a file that failed the schema, reduced to the text the preview draws. */
export function rawStagesFrom(raw: unknown): BoardRawStageDTO[] | null {
    const stages = (raw as { stages?: unknown } | null)?.stages;
    if (!Array.isArray(stages)) {
        return null;
    }
    return stages.map((stage) => {
        const record = (stage ?? {}) as Record<string, unknown>;
        return {
            key: textOrNull(record.key),
            column: textOrNull(record.column),
            command: textOrNull(record.command),
            model: textOrNull(record.model),
            onRework: textOrNull(record.onRework),
        };
    });
}

function resolveClient(profile: UserDTO):
    | Refusal
    | {
          ok: true;
          client: GithubClient;
          login: string;
      } {
    const client = getGithubClient();
    if (!client) {
        return { ok: false, response: githubAppNotConfiguredResponse() };
    }
    const login = profile.github?.login;
    if (!login) {
        return refuse("BOARD_GITHUB_ACCOUNT_REQUIRED", HTTP_STATUS.FORBIDDEN);
    }
    return { ok: true, client, login };
}

const canOwnBoard = (role: GithubRepoRole) =>
    resolveEffectiveRole("owner", role) === "owner";

function githubFailure(error: unknown): Refusal {
    const response = githubErrorResponse(error);
    if (!response) {
        throw error;
    }
    return { ok: false, response };
}

/**
 * Everything creating or reloading a board needs, resolved on the server: the repository
 * comes from the installation listing (never from the caller, so neither does the
 * installation id), the caller must be admin on it, and the file is read from the default
 * branch.
 */
export async function resolveImportTarget(
    profile: UserDTO,
    fullName: string
): Promise<ImportTarget> {
    const resolved = resolveClient(profile);
    if (!resolved.ok) {
        return resolved;
    }
    const { client, login } = resolved;

    try {
        const repositories = await client.listInstallationRepositories();
        const wanted = fullName.toLowerCase();
        const repository = repositories.find(
            (candidate) => candidate.fullName.toLowerCase() === wanted
        );
        if (!repository) {
            return repositoryNotAccessible();
        }

        const githubRole = await client.getCollaboratorRole(repository, login);
        if (githubRole === "none") {
            return repositoryNotAccessible();
        }
        if (!canOwnBoard(githubRole)) {
            return refuse("BOARD_IMPORT_FORBIDDEN", HTTP_STATUS.FORBIDDEN);
        }

        const file = await client.readFile(
            repository,
            BOARD_CONFIG_PATH,
            repository.defaultBranch
        );

        return {
            ok: true,
            client,
            repository,
            githubRole,
            file,
            parsed: file ? parseBoardConfigYaml(file.content) : null,
        };
    } catch (error) {
        return githubFailure(error);
    }
}

/**
 * Only the repositories where the caller is admin: without this filter any signed-in
 * account would see every private repository of the installation.
 */
export async function listAdminRepositories(
    profile: UserDTO
): Promise<Refusal | { ok: true; repositories: GithubRepository[] }> {
    const resolved = resolveClient(profile);
    if (!resolved.ok) {
        return resolved;
    }
    const { client, login } = resolved;

    try {
        const repositories = await client.listInstallationRepositories();
        const roles = await mapWithConcurrency(
            repositories,
            ROLE_LOOKUP_CONCURRENCY,
            (repository) => client.getCollaboratorRole(repository, login)
        );
        return {
            ok: true,
            repositories: repositories.filter((_, index) =>
                canOwnBoard(roles[index] ?? "none")
            ),
        };
    } catch (error) {
        return githubFailure(error);
    }
}

type ResolvedTarget = Extract<ImportTarget, { ok: true }>;

export function toImportPreview(
    target: ResolvedTarget,
    board: RepositoryBoardLink
): BoardImportPreviewDTO {
    const { file, parsed } = target;
    const base = {
        repository: toBoardRepository(target.repository),
        githubRole: target.githubRole,
        board,
        file: file
            ? {
                  path: BOARD_CONFIG_PATH,
                  ref: target.repository.defaultBranch,
                  sha: file.sha,
              }
            : null,
    };

    if (!parsed) {
        return {
            ...base,
            status: "missing",
            config: null,
            rawStages: null,
            issues: [],
        };
    }
    if (!parsed.ok) {
        return {
            ...base,
            status: "invalid",
            config: null,
            rawStages: rawStagesFrom(parsed.raw),
            issues: parsed.issues,
        };
    }
    return {
        ...base,
        status: "valid",
        config: parsed.config,
        rawStages: null,
        issues: [],
    };
}
