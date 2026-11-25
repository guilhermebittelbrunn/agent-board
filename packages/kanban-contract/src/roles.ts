export const BOARD_ROLES = [
    "viewer",
    "operator",
    "maintainer",
    "owner",
] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export const GITHUB_REPO_ROLES = [
    "none",
    "read",
    "triage",
    "write",
    "maintain",
    "admin",
] as const;
export type GithubRepoRole = (typeof GITHUB_REPO_ROLES)[number];

// A board role never grants more than the member can already do on the repository.
const MINIMUM_GITHUB_ROLE: Record<BoardRole, GithubRepoRole> = {
    viewer: "read",
    operator: "write",
    maintainer: "maintain",
    owner: "admin",
};

const boardRank = (role: BoardRole) => BOARD_ROLES.indexOf(role);
const githubRank = (role: GithubRepoRole) => GITHUB_REPO_ROLES.indexOf(role);

export function resolveEffectiveRole(
    boardRole: BoardRole,
    githubRole: GithubRepoRole
): BoardRole | null {
    const candidates = BOARD_ROLES.slice(0, boardRank(boardRole) + 1).reverse();
    return (
        candidates.find(
            (role) =>
                githubRank(githubRole) >= githubRank(MINIMUM_GITHUB_ROLE[role])
        ) ?? null
    );
}

export function canViewBoard(role: BoardRole | null): boolean {
    return role !== null;
}

export function canTriggerStages(role: BoardRole | null): boolean {
    return role !== null && boardRank(role) >= boardRank("operator");
}

export function canManageMembers(role: BoardRole | null): boolean {
    return role !== null && boardRank(role) >= boardRank("maintainer");
}

export function canConfigureBoard(role: BoardRole | null): boolean {
    return role === "owner";
}
