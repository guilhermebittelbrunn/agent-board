import type {
    BoardConfig,
    BoardConfigIssue,
    BoardStagesDiff,
    GithubRepoRole,
} from "@repo/kanban-contract";
import type { BoardBacklogSyncDTO } from "./card";
import type { BoardViewDTO } from "./member";
import type { BoardStageSettingsDTO } from "./run";

export type BoardRepositoryDTO = {
    installationId: number;
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    private: boolean;
};

export type BoardConfigSourceDTO = {
    path: string;
    ref: string;
    sha: string;
    readAt: string;
};

export type BoardDTO = {
    id: string;
    ownerUserId: string;
    ownerGithubId: string;
    name: string;
    repository: BoardRepositoryDTO;
    config: BoardConfig;
    configSource: BoardConfigSourceDTO;
    /** `null` until the backlog is synced for the first time. */
    backlogSync: BoardBacklogSyncDTO | null;
    /** The board's own choices per stage key; a stage without an entry has no limit nor gate. */
    stageSettings: BoardStageSettingsDTO;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

/** `"taken"`: the repository already has a board that belongs to someone else. */
export type RepositoryBoardLink = { boardId: string } | "taken" | null;

export type ImportableRepositoryDTO = BoardRepositoryDTO & {
    board: RepositoryBoardLink;
};

export type BoardConfigFileStatus = "valid" | "invalid" | "missing";

/**
 * A stage as written in a file that failed the schema: only the text fields that were
 * strings, so the preview can still draw the column next to its error.
 */
export type BoardRawStageDTO = {
    key: string | null;
    column: string | null;
    command: string | null;
    model: string | null;
    onRework: string | null;
};

export type BoardImportPreviewDTO = {
    repository: BoardRepositoryDTO;
    githubRole: GithubRepoRole;
    board: RepositoryBoardLink;
    status: BoardConfigFileStatus;
    file: { path: string; ref: string; sha: string } | null;
    config: BoardConfig | null;
    rawStages: BoardRawStageDTO[] | null;
    issues: BoardConfigIssue[];
};

export type CreateBoardRequest = { repository: string };

export type BoardReloadOutcome =
    | "unchanged"
    | "updated"
    | "invalid"
    | "missing";

export type BoardReloadResultDTO = {
    outcome: BoardReloadOutcome;
    board: BoardViewDTO;
    changes: BoardStagesDiff | null;
    issues: BoardConfigIssue[];
};
