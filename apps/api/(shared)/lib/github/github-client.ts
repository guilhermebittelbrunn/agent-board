import type { GithubRepoRole } from "@repo/kanban-contract";
import { env } from "@/env";
import {
    githubAppCredentials,
    resolveGithubClientMode,
} from "./github-app-config";
import { githubFakeClient } from "./github-fake-client";
import { createGithubRestClient } from "./github-rest-client";

export type GithubRepositoryRef = {
    installationId: number;
    owner: string;
    name: string;
};

export type GithubRepository = GithubRepositoryRef & {
    fullName: string;
    defaultBranch: string;
    private: boolean;
};

export type GithubFile = { content: string; sha: string };

export type GithubClient = {
    listInstallationRepositories(): Promise<GithubRepository[]>;
    readFile(
        repo: GithubRepositoryRef,
        path: string,
        ref: string
    ): Promise<GithubFile | null>;
    getCollaboratorRole(
        repo: GithubRepositoryRef,
        username: string
    ): Promise<GithubRepoRole>;
};

let restClient: GithubClient | null = null;

/**
 * `null` means the App is not configured outside the emulator: answer with
 * `githubAppNotConfiguredResponse()`. Errors thrown by the client are `GithubApiError`,
 * turned into a response by `githubErrorResponse()`.
 */
export function getGithubClient(): GithubClient | null {
    switch (resolveGithubClientMode(env)) {
        case "app": {
            const credentials = githubAppCredentials(env);
            if (credentials && !restClient) {
                restClient = createGithubRestClient(credentials);
            }
            return restClient;
        }
        case "fake":
            return githubFakeClient;
        default:
            return null;
    }
}
