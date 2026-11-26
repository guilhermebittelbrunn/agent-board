import type {
    BoardRole,
    GithubRepoRole,
    InvitableBoardRole,
    StageExecutorKind,
} from "@repo/kanban-contract";
import type { BoardDTO } from "./board";

export type { InvitableBoardRole } from "@repo/kanban-contract";

export type BoardMemberStatus = "pending" | "active";

export type BoardAccessDTO = {
    role: BoardRole;
    githubRole: GithubRepoRole | null;
    effectiveRole: BoardRole | null;
    checkedAt: string | null;
};

/** `executor` is what would run a stage the reader triggers now; `null` when nothing would. */
export type BoardViewDTO = BoardDTO & {
    access: BoardAccessDTO;
    executor: StageExecutorKind | null;
};

export type BoardMemberDTO = {
    id: string;
    boardId: string;
    login: string;
    name: string | null;
    avatarUrl: string | null;
    role: BoardRole;
    status: BoardMemberStatus;
    githubRole: GithubRepoRole | null;
    effectiveRole: BoardRole | null;
    githubRoleCheckedAt: string | null;
    joinedAt: string | null;
    createdAt: string;
    /** The member is the person asking; the screen hides their own actions. */
    isSelf: boolean;
};

export type InviteBoardMemberRequest = {
    login: string;
    role: InvitableBoardRole;
};

export type UpdateBoardMemberRequest = { role: InvitableBoardRole };
