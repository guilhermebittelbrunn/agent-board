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

/** Sync the backlog, reorder Tasks and move cards between columns without triggering a stage. */
export function canPrioritizeCards(role: BoardRole | null): boolean {
    return role !== null && boardRank(role) >= boardRank("operator");
}

/** Answering a stage's questions resumes that stage, so it takes the same role as triggering one. */
export function canAnswerQuestions(role: BoardRole | null): boolean {
    return role !== null && boardRank(role) >= boardRank("operator");
}

export function canCommentOnCards(role: BoardRole | null): boolean {
    return role !== null;
}

export function canManageMembers(role: BoardRole | null): boolean {
    return role !== null && boardRank(role) >= boardRank("maintainer");
}

export function canConfigureBoard(role: BoardRole | null): boolean {
    return role === "owner";
}

export const INVITABLE_BOARD_ROLES = [
    "viewer",
    "operator",
    "maintainer",
] as const;
export type InvitableBoardRole = (typeof INVITABLE_BOARD_ROLES)[number];

// A board has a single owner, so no one is invited or promoted to `owner`, and no one hands out a role above their own.
export function canGrantRole(
    actor: BoardRole | null,
    role: BoardRole
): boolean {
    if (actor === null || !canManageMembers(actor) || role === "owner") {
        return false;
    }
    return boardRank(role) <= boardRank(actor);
}

export function grantableRoles(actor: BoardRole | null): InvitableBoardRole[] {
    return INVITABLE_BOARD_ROLES.filter((role) => canGrantRole(actor, role));
}

export function canChangeMember(
    actor: { id: string; role: BoardRole | null },
    target: { id: string; role: BoardRole }
): boolean {
    if (actor.role === null || !canManageMembers(actor.role)) {
        return false;
    }
    if (target.role === "owner" || target.id === actor.id) {
        return false;
    }
    return boardRank(target.role) <= boardRank(actor.role);
}
