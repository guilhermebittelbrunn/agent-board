import {
    type BoardRole,
    canAnswerQuestions,
    canCommentOnCards,
    canConfigureBoard,
    canManageMembers,
    canPrioritizeCards,
    canTriggerStages,
    canViewBoard,
    type GithubRepoRole,
} from "@repo/kanban-contract";
import type { BoardAccessDTO, BoardDTO, UserDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    type BoardMemberRecord,
    effectiveRoleOf,
    type MemberIdentity,
    toBoardAccess,
} from "@/(shared)/mappers/board-member.mapper";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { boardMemberRepository } from "@/(shared)/repositories/board-member.repository";
import { getGithubClient } from "./github/github-client";
import {
    githubAppNotConfiguredResponse,
    githubErrorResponse,
} from "./github/github-errors";

export type BoardCapability =
    | "view"
    | "manageMembers"
    | "configure"
    | "trigger"
    | "prioritize"
    | "comment"
    | "answer";

const CAPABILITY_CHECK: Record<
    BoardCapability,
    (role: BoardRole | null) => boolean
> = {
    view: canViewBoard,
    manageMembers: canManageMembers,
    configure: canConfigureBoard,
    trigger: canTriggerStages,
    prioritize: canPrioritizeCards,
    comment: canCommentOnCards,
    answer: canAnswerQuestions,
};

/** Same lifetime as the permission cache, so a member costs at most one write per window. */
export const MEMBER_CHECK_TTL_MS = 300_000;

type Refusal = { ok: false; response: Response };

export type BoardAccess =
    | Refusal
    | {
          ok: true;
          board: BoardDTO;
          member: BoardMemberRecord;
          access: BoardAccessDTO;
      };

const refuse = (code: string, status: number): Refusal => ({
    ok: false,
    response: Response.json({ error: { code } }, { status }),
});

const boardNotFound = () => refuse("BOARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);

/**
 * Who the person is on this board. A board created before members existed gets its owner
 * document here, and a pending invitation for the person's login is claimed.
 */
async function findMembership(
    board: BoardDTO,
    identity: MemberIdentity
): Promise<BoardMemberRecord | null> {
    const active = await boardMemberRepository.findActive(
        board.id,
        identity.github.id
    );
    if (active) {
        return active;
    }

    if (board.ownerUserId === identity.userId) {
        return boardMemberRepository.createOwnerMember(board.id, identity);
    }

    const pending = await boardMemberRepository.findPending(
        board.id,
        identity.github.login
    );
    return pending
        ? boardMemberRepository.activate(pending.id, identity)
        : null;
}

function checkIsStale(
    member: BoardMemberRecord,
    githubRole: GithubRepoRole,
    login: string,
    now: Date
): boolean {
    if (member.githubRole !== githubRole || member.login !== login) {
        return true;
    }
    if (!member.githubRoleCheckedAt) {
        return true;
    }
    return (
        now.getTime() - Date.parse(member.githubRoleCheckedAt) >=
        MEMBER_CHECK_TTL_MS
    );
}

/**
 * Resolves the effective role of the person on a board: the role on the board, capped by
 * the permission on the repository. A non-member gets 404 so the board does not leak, even
 * when they are admin on the repository.
 */
export async function resolveBoardAccess(input: {
    boardId: string;
    profile: UserDTO;
    capability: BoardCapability;
    now?: Date;
}): Promise<BoardAccess> {
    const { profile, capability } = input;
    const now = input.now ?? new Date();

    const board = await boardRepository.findById(input.boardId);
    if (!board) {
        return boardNotFound();
    }
    const github = profile.github;
    if (!github) {
        return boardNotFound();
    }

    const member = await findMembership(board, {
        userId: profile.id,
        github,
    });
    if (!member) {
        return boardNotFound();
    }

    const client = getGithubClient();
    if (!client) {
        return { ok: false, response: githubAppNotConfiguredResponse() };
    }

    let githubRole: GithubRepoRole;
    try {
        githubRole = await client.getCollaboratorRole(
            board.repository,
            github.login
        );
    } catch (error) {
        const response = githubErrorResponse(error);
        if (!response) {
            throw error;
        }
        return { ok: false, response };
    }

    const stale = checkIsStale(member, githubRole, github.login, now);
    const checked: BoardMemberRecord = {
        ...member,
        login: github.login,
        loginLower: github.login.toLowerCase(),
        githubRole,
        effectiveRole: effectiveRoleOf(member.role, githubRole),
        githubRoleCheckedAt: stale
            ? now.toISOString()
            : member.githubRoleCheckedAt,
    };

    // Written before refusing, so the members screen shows who lost the repository.
    if (stale) {
        await boardMemberRepository.recordCheck(member.id, {
            githubRole,
            checkedAt: now,
            ...(member.login === github.login ? {} : { login: github.login }),
        });
    }

    if (checked.effectiveRole === null) {
        return refuse("BOARD_REPOSITORY_ACCESS_LOST", HTTP_STATUS.FORBIDDEN);
    }
    if (!CAPABILITY_CHECK[capability](checked.effectiveRole)) {
        return refuse("BOARD_ROLE_INSUFFICIENT", HTTP_STATUS.FORBIDDEN);
    }

    return { ok: true, board, member: checked, access: toBoardAccess(checked) };
}
