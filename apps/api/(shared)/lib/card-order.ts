import type { CardLane } from "@repo/kanban-contract";

type Sortable = {
    slug: string;
    lane: CardLane;
    order: number;
    movedAt: string | null;
};

const LANE_RANK: Record<CardLane, number> = { tasks: 0, stage: 1, done: 2 };

/**
 * Tasks by the board's order, every other lane oldest move first. The slug breaks ties, so
 * two cards that got the same `order` from concurrent syncs still show in a stable order.
 */
export function compareCards(left: Sortable, right: Sortable): number {
    const lane = LANE_RANK[left.lane] - LANE_RANK[right.lane];
    if (lane !== 0) {
        return lane;
    }
    if (left.lane === "tasks") {
        return left.order - right.order || left.slug.localeCompare(right.slug);
    }
    return (
        (left.movedAt ?? "").localeCompare(right.movedAt ?? "") ||
        left.slug.localeCompare(right.slug)
    );
}

export const sortCards = <T extends Sortable>(cards: readonly T[]): T[] =>
    [...cards].sort(compareCards);

/** The next free position at the end of Tasks. */
export const nextTasksOrder = (cards: readonly { order: number }[]): number =>
    cards.reduce((max, card) => Math.max(max, card.order), -1) + 1;
