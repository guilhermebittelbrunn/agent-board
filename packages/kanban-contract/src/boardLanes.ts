import type { BoardConfig } from "./boardConfig";

export const CARD_LANES = ["drafts", "tasks", "stage", "done"] as const;
export type CardLane = (typeof CARD_LANES)[number];

export type BoardStageColumn = {
    id: `stage:${string}`;
    lane: "stage";
    stageKey: string;
    title: string;
    command: string;
    model: string;
    effort: string;
};

export type BoardColumn =
    | { id: "drafts"; lane: "drafts" }
    | { id: "tasks"; lane: "tasks" }
    | BoardStageColumn
    | { id: "done"; lane: "done" };

export const stageColumnId = (stageKey: string): `stage:${string}` =>
    `stage:${stageKey}`;

/** Drafts and Tasks first, one column per stage in the order of `board.yml`, then Done. */
export function boardColumns(config: BoardConfig): BoardColumn[] {
    return [
        { id: "drafts", lane: "drafts" },
        { id: "tasks", lane: "tasks" },
        ...config.stages.map(
            (stage): BoardStageColumn => ({
                id: stageColumnId(stage.key),
                lane: "stage",
                stageKey: stage.key,
                title: stage.column,
                command: stage.command,
                model: stage.model,
                effort: stage.effort,
            })
        ),
        { id: "done", lane: "done" },
    ];
}

/** A card only enters Tasks while its spec has the ready status and is still in the backlog. */
export function isCardReady(
    specStatus: string,
    readyStatus: string,
    orphan: boolean
): boolean {
    return !orphan && specStatus === readyStatus;
}
