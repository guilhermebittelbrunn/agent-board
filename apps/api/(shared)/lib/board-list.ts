import type {
    BoardAccessDTO,
    BoardViewDTO,
    UserDTO,
} from "@repo/sdk/src/types";
import { toBoardView } from "@/(shared)/lib/board-view";
import { resolveExecutorFor } from "@/(shared)/lib/orchestrator/executor-choice";
import { toBoardAccess } from "@/(shared)/mappers/board-member.mapper";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { boardMemberRepository } from "@/(shared)/repositories/board-member.repository";

/** A board created before members existed: the owner, not checked on GitHub yet. */
const UNCHECKED_OWNER: BoardAccessDTO = {
    role: "owner",
    githubRole: null,
    effectiveRole: null,
    checkedAt: null,
};

/**
 * The boards a person is a member of, plus the ones they own from before members existed.
 * The access comes from the last stored check, without asking GitHub: opening a board is
 * what checks again. Pending invitations for the person's login are claimed first.
 */
export async function listBoardsOf(profile: UserDTO): Promise<BoardViewDTO[]> {
    const github = profile.github;
    if (github) {
        await boardMemberRepository.claimPendingFor({
            userId: profile.id,
            github,
        });
    }

    const members = github
        ? await boardMemberRepository.listActiveByGithubId(github.id)
        : [];
    const accessByBoard = new Map(
        members.map((member) => [member.boardId, toBoardAccess(member)])
    );

    const [memberBoards, ownedBoards] = await Promise.all([
        boardRepository.listByIds([...accessByBoard.keys()]),
        boardRepository.listByOwner(profile.id),
    ]);

    const executor = await resolveExecutorFor(profile.id);
    const views = new Map<string, BoardViewDTO>();
    for (const board of [...memberBoards, ...ownedBoards]) {
        if (!views.has(board.id)) {
            views.set(
                board.id,
                toBoardView(
                    board,
                    accessByBoard.get(board.id) ?? UNCHECKED_OWNER,
                    executor
                )
            );
        }
    }

    return [...views.values()].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
    );
}
