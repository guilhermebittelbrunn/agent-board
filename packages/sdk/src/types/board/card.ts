import type {
    AttachmentType,
    CardLane,
    CardOrigin,
    CardPendingAsk,
    CardPullRequest,
    CardState,
    PullRequestChecksSummary,
    PullRequestReviewState,
} from "@repo/kanban-contract";
import type { CardLastRunDTO, RunDTO } from "./run";

export type { AttachmentType, CardOrigin } from "@repo/kanban-contract";

/** `ref: null` reads the spec on the base branch; a draft points to the card branch. */
export type CardSpecDTO = {
    path: string;
    sha: string;
    status: string;
    ref: string | null;
};

export type CardAttachmentDTO = {
    id: string;
    name: string;
    contentType: AttachmentType;
    size: number;
};

/** What a person wrote on the board to start a spec draft. */
export type CardRequestDTO = {
    text: string;
    attachments: CardAttachmentDTO[];
    requestedBy: { userId: string; login: string };
    requestedAt: string;
};

export type CardSpecApprovalDTO = { userId: string; login: string; at: string };

/** The card's pull request as the screen sees it; who runs the comment command stays in the API. */
export type CardPullRequestDTO = Omit<
    CardPullRequest,
    "dispatchAs" | "commentRunsAt" | "unhandledCommentAt"
> & {
    checksSummary: PullRequestChecksSummary;
    reviewsSummary: PullRequestReviewState | null;
    /** A comment arrived and waits for the comment command to run. */
    pendingComment: boolean;
};

/** The last attempt to open the pull request failed; `code` is an API error code. */
export type CardPullRequestErrorDTO = { code: string; at: string };

export type CardDTO = {
    id: string;
    boardId: string;
    slug: string;
    title: string;
    spec: CardSpecDTO;
    /** The spec has the board's ready status and is still in the backlog. */
    ready: boolean;
    /** The spec left the backlog index or its file is gone; the card is kept. */
    orphan: boolean;
    lane: CardLane;
    /** `board` for a card born as a spec draft on the board. */
    origin: CardOrigin;
    request: CardRequestDTO | null;
    specApproval: CardSpecApprovalDTO | null;
    /** Set when `lane` is `"stage"`, and `"spec"` while the card is a draft. */
    stageKey: string | null;
    state: CardState;
    /** Questions of a stage waiting for an answer; the screen shows `waiting_input` while set. */
    pendingAsk: CardPendingAsk | null;
    reworkLoops: number;
    /** Position in Tasks, 0 on top. */
    order: number;
    branch: string | null;
    /** The queued or running run; a card holds at most one. */
    activeRunId: string | null;
    lastRun: CardLastRunDTO | null;
    pullRequest: CardPullRequestDTO | null;
    pullRequestError: CardPullRequestErrorDTO | null;
    /** The cycle the card runs in; `null` outside a cycle. */
    cycleId: string | null;
    movedAt: string | null;
    syncedAt: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type CardSyncSkipReason =
    | "not_found"
    | "frontmatter_invalid"
    | "slug_invalid"
    | "slug_duplicated"
    | "limit";

export type CardSyncSkipDTO = { path: string; reason: CardSyncSkipReason };

export type BoardBacklogSyncDTO = {
    indexPath: string;
    indexSha: string;
    ref: string;
    syncedAt: string;
    /** Specs found in the index on the last sync, ready or not. */
    specCount: number;
};

export type CardSyncResultDTO = {
    created: number;
    updated: number;
    orphaned: number;
    unchanged: number;
    skipped: CardSyncSkipDTO[];
    cards: CardDTO[];
    backlogSync: BoardBacklogSyncDTO;
};

export type ReorderCardsRequest = { slugs: string[] };

/** Entering a stage column triggers the stage instead (`TriggerStageRequest`). */
export type MoveCardRequest = { lane: "tasks" } | { lane: "done" };

/** `content: null` when the file is no longer in the repository. */
export type CardSpecContentDTO = {
    path: string;
    ref: string;
    sha: string | null;
    /** Markdown of the spec without its frontmatter block; `null` when the file is gone. */
    content: string | null;
};

export type UploadedAttachmentDTO = {
    path: string;
    name: string;
    contentType: AttachmentType;
    size: number;
};

export type CreateSpecDraftRequest = {
    text: string;
    attachments: { path: string; name: string }[];
};

/** `run: null` when the card was created but the writing could not be queued. */
export type CreateSpecDraftResultDTO = { card: CardDTO; run: RunDTO | null };
