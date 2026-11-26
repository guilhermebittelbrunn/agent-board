import type {
    CardLane,
    CardPendingAsk,
    CardState,
} from "@repo/kanban-contract";
import type { CardLastRunDTO } from "./run";

export type CardSpecDTO = { path: string; sha: string; status: string };

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
    /** Set only when `lane` is `"stage"`. */
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
