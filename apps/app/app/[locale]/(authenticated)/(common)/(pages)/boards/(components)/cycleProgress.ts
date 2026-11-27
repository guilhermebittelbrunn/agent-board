import {
    type CardState,
    type CycleItemStatus,
    displayCardState,
    type StageConfig,
} from "@repo/kanban-contract";
import type { CardDTO, CycleDTO } from "@repo/sdk/src/types";

export type CycleProgressCell =
    | { kind: "done" }
    | { kind: "pending" }
    | { kind: "current"; state: CardState; reworkLoops: number }
    | { kind: "pullRequest"; number: number; draft: boolean };

export type CycleProgressRow = {
    slug: string;
    title: string;
    position: number;
    status: CycleItemStatus;
    cells: CycleProgressCell[];
};

type Stage = Pick<StageConfig, "key" | "pullRequest">;

function cellsOf(
    card: CardDTO | undefined,
    stages: readonly Stage[]
): CycleProgressCell[] {
    const pending = stages.map((): CycleProgressCell => ({ kind: "pending" }));
    if (card === undefined) {
        return pending;
    }
    if (card.lane === "done") {
        return stages.map((): CycleProgressCell => ({ kind: "done" }));
    }
    const index =
        card.lane === "stage"
            ? stages.findIndex((stage) => stage.key === card.stageKey)
            : -1;
    if (index === -1) {
        return pending;
    }
    return stages.map((stage, stageIndex): CycleProgressCell => {
        if (stageIndex < index) {
            return { kind: "done" };
        }
        if (stageIndex > index) {
            return { kind: "pending" };
        }
        if (stage.pullRequest !== undefined && card.pullRequest !== null) {
            return {
                kind: "pullRequest",
                number: card.pullRequest.number,
                draft: card.pullRequest.draft,
            };
        }
        return {
            kind: "current",
            state: displayCardState(card),
            reworkLoops: card.reworkLoops,
        };
    });
}

/**
 * The spec × stage matrix of the cycle screen. Each cell comes from the card as it is now:
 * the stages before its current one are done, the current one shows the card's state, and
 * the pull request stage shows the pull request once it is open.
 */
export function cycleProgress(
    cycle: Pick<CycleDTO, "items">,
    cards: readonly CardDTO[],
    stages: readonly Stage[]
): CycleProgressRow[] {
    const bySlug = new Map(cards.map((card) => [card.slug, card]));
    return cycle.items.map((item, index) => ({
        slug: item.slug,
        title: item.title,
        position: index + 1,
        status: item.status,
        cells: cellsOf(bySlug.get(item.slug), stages),
    }));
}
