import type {
    CycleEndReason,
    CycleItemStatus,
    CycleOptions,
    CycleStatus,
    StageDecision,
} from "@repo/kanban-contract";
import type { CardDTO } from "./card";

export type CycleOptionsDTO = CycleOptions;

export type CycleItemDTO = {
    slug: string;
    title: string;
    status: CycleItemStatus;
    /** The API error code that kept the item from starting, when that happened. */
    code: string | null;
    startedAt: string | null;
    endedAt: string | null;
};

export type CycleDTO = {
    id: string;
    boardId: string;
    status: CycleStatus;
    endReason: CycleEndReason | null;
    options: CycleOptionsDTO;
    /** In the order they run. */
    items: CycleItemDTO[];
    startedByLogin: string;
    stoppedByLogin: string | null;
    /** `null` while the cycle waits in the queue. */
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type CycleDecisionDTO = StageDecision & {
    eventId: string;
    slug: string;
    stageKey: string | null;
    at: string;
};

export type CycleActivityDTO = {
    eventId: string;
    slug: string;
    stageKey: string | null;
    type: "update" | "report";
    markdown: string;
    at: string;
};

export type CycleDetailDTO = {
    cycle: CycleDTO;
    /** The cards of the items, in the cycle's order; a card deleted since is left out. */
    cards: CardDTO[];
    /** Newest first. */
    decisions: CycleDecisionDTO[];
    /** The latest updates and reports, newest first. */
    activity: CycleActivityDTO[];
};

export type CreateCycleRequest = {
    slugs: string[];
    options: CycleOptionsDTO;
};
