import type { CardDTO } from "@repo/sdk/src/types";

/** How often the board and the card are read again while a stage is queued or running. */
export const ACTIVE_RUN_REFETCH_MS = 5000;

const isLive = (card: Pick<CardDTO, "state">) =>
    card.state === "queued" || card.state === "running";

export function hasActiveRun(
    data: Pick<CardDTO, "state"> | Pick<CardDTO, "state">[] | undefined
): boolean {
    if (data === undefined) {
        return false;
    }
    return Array.isArray(data) ? data.some(isLive) : isLive(data);
}

/** The `refetchInterval` of a query of cards: polls only while something runs. */
export const activeRunRefetchInterval = (
    data: Pick<CardDTO, "state"> | Pick<CardDTO, "state">[] | undefined
): number | false => (hasActiveRun(data) ? ACTIVE_RUN_REFETCH_MS : false);

export function countRuns(cards: readonly Pick<CardDTO, "state">[]): {
    running: number;
    queued: number;
} {
    return {
        running: cards.filter((card) => card.state === "running").length,
        queued: cards.filter((card) => card.state === "queued").length,
    };
}
