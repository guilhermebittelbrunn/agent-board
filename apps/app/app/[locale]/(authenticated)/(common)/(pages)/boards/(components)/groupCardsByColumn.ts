import {
    type BoardColumn,
    type BoardConfig,
    boardColumns,
} from "@repo/kanban-contract";
import type { CardDTO, MoveCardRequest } from "@repo/sdk/src/types";

/** A stage column that `board.yml` no longer has, kept so its cards stay visible. */
export type RemovedStageColumn = {
    id: `removed:${string}`;
    lane: "stage";
    stageKey: string;
    removed: true;
};

export type BoardScreenColumn = BoardColumn | RemovedStageColumn;

export type GroupedColumn = { column: BoardScreenColumn; cards: CardDTO[] };

export type GroupedBoard = {
    columns: GroupedColumn[];
    /** Cards in Tasks whose spec is not ready (orphans included), outside the queue. */
    notReady: CardDTO[];
};

const byOrder = (left: CardDTO, right: CardDTO) =>
    left.order - right.order || left.slug.localeCompare(right.slug);

const byMovedAt = (left: CardDTO, right: CardDTO) =>
    (left.movedAt ?? "").localeCompare(right.movedAt ?? "") ||
    left.slug.localeCompare(right.slug);

const newestFirst = (left: CardDTO, right: CardDTO) =>
    right.createdAt.localeCompare(left.createdAt) ||
    left.slug.localeCompare(right.slug);

export const isRemovedStage = (
    column: BoardScreenColumn
): column is RemovedStageColumn => "removed" in column;

/**
 * Splits the cards into the columns of the board. A card whose stage left `board.yml`
 * gets a column of its own before Done instead of disappearing.
 */
export function groupCardsByColumn(
    cards: readonly CardDTO[],
    config: BoardConfig
): GroupedBoard {
    const columns = boardColumns(config);
    const knownStages = new Set(config.stages.map((stage) => stage.key));
    const removedStages: string[] = [];
    for (const card of cards) {
        if (
            card.lane === "stage" &&
            card.stageKey !== null &&
            !knownStages.has(card.stageKey) &&
            !removedStages.includes(card.stageKey)
        ) {
            removedStages.push(card.stageKey);
        }
    }

    const cardsOf = (column: BoardScreenColumn): CardDTO[] => {
        if (column.lane === "drafts") {
            return cards
                .filter((card) => card.lane === "drafts")
                .sort(newestFirst);
        }
        if (column.lane === "tasks") {
            return cards
                .filter((card) => card.lane === "tasks" && card.ready)
                .sort(byOrder);
        }
        if (column.lane === "done") {
            return cards.filter((card) => card.lane === "done").sort(byMovedAt);
        }
        return cards
            .filter(
                (card) =>
                    card.lane === "stage" && card.stageKey === column.stageKey
            )
            .sort(byMovedAt);
    };

    const done = columns.at(-1) as BoardColumn;
    const ordered: BoardScreenColumn[] = [
        ...columns.slice(0, -1),
        ...removedStages.map(
            (stageKey): RemovedStageColumn => ({
                id: `removed:${stageKey}`,
                lane: "stage",
                stageKey,
                removed: true,
            })
        ),
        done,
    ];

    return {
        columns: ordered.map((column) => ({ column, cards: cardsOf(column) })),
        notReady: cards
            .filter((card) => card.lane === "tasks" && !card.ready)
            .sort(byOrder),
    };
}

/** Tasks and Done take a move; entering a stage column triggers that stage. */
export type ColumnTarget =
    | MoveCardRequest
    | { lane: "stage"; stageKey: string };

/**
 * What dropping a card in this column asks for, `null` for a column nobody can drop into:
 * a removed stage, and Drafts, which only takes cards born there.
 */
export function moveTargetOf(column: BoardScreenColumn): ColumnTarget | null {
    if (isRemovedStage(column) || column.lane === "drafts") {
        return null;
    }
    if (column.lane === "stage") {
        return { lane: "stage", stageKey: column.stageKey };
    }
    return { lane: column.lane };
}

export const isCardInColumn = (
    card: CardDTO,
    column: BoardScreenColumn
): boolean =>
    card.lane === column.lane &&
    (column.lane !== "stage" || card.stageKey === column.stageKey);

/** The Tasks queue with `slug` moved to `index`, or `null` when nothing changes. */
export function reorderedSlugs(
    queue: readonly CardDTO[],
    slug: string,
    index: number
): string[] | null {
    const slugs = queue.map((card) => card.slug);
    const from = slugs.indexOf(slug);
    const to = Math.max(0, Math.min(index, slugs.length - 1));
    if (from === -1 || from === to) {
        return null;
    }
    slugs.splice(from, 1);
    slugs.splice(to, 0, slug);
    return slugs;
}
