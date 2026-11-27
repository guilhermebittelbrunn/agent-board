import { z } from "zod";
import { type BoardConfig, findPullRequestStage } from "./boardConfig";
import type { CardState } from "./cardState";

export const MAX_CYCLE_SPECS = 10;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CYCLE_STATUSES = [
    "queued",
    "running",
    "finished",
    "stopped",
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const CYCLE_END_REASONS = [
    "completed",
    "stopped",
    "item_failed",
] as const;
export type CycleEndReason = (typeof CYCLE_END_REASONS)[number];

export const CYCLE_ITEM_STATUSES = [
    "pending",
    "running",
    "done",
    "waiting_input",
    "failed",
    "skipped",
    "stopped",
] as const;
export type CycleItemStatus = (typeof CYCLE_ITEM_STATUSES)[number];

export const CYCLE_UNTIL = ["testing", "pull_request"] as const;
export type CycleUntil = (typeof CYCLE_UNTIL)[number];

export const CYCLE_ON_FAILURE = ["skip", "stop"] as const;
export type CycleOnFailure = (typeof CYCLE_ON_FAILURE)[number];

export const CYCLE_CONCURRENCY = [1, 2] as const;
export type CycleConcurrency = (typeof CYCLE_CONCURRENCY)[number];

export const cycleOptionsSchema = z.object({
    until: z.enum(CYCLE_UNTIL),
    concurrency: z.union([z.literal(1), z.literal(2)]),
    onFailure: z.enum(CYCLE_ON_FAILURE),
});
export type CycleOptions = z.infer<typeof cycleOptionsSchema>;

export const createCycleInputSchema = z.object({
    slugs: z
        .array(z.string().regex(SLUG))
        .min(1)
        .max(MAX_CYCLE_SPECS)
        .refine((slugs) => new Set(slugs).size === slugs.length, {
            message: "Slugs must be unique",
        }),
    options: cycleOptionsSchema,
});
export type CreateCycleInput = z.infer<typeof createCycleInputSchema>;

/** How an item left the cycle; `running` and `pending` are the states before that. */
export type CycleItemResult = Exclude<CycleItemStatus, "pending" | "running">;

export type CycleItemState = {
    slug: string;
    status: CycleItemStatus;
    code: string | null;
    startedAt: string | null;
    endedAt: string | null;
};

export type CycleState<Item extends CycleItemState = CycleItemState> = {
    status: CycleStatus;
    endReason: CycleEndReason | null;
    options: CycleOptions;
    items: Item[];
};

export type CycleEvent = {
    slug: string;
    result: CycleItemResult;
    code?: string | null;
};

export type CycleAdvance<Item extends CycleItemState> = {
    cycle: CycleState<Item>;
    /** Slugs to trigger now, in the cycle's order. */
    start: string[];
    /** `true` when this call ended the cycle. */
    ended: boolean;
};

/**
 * The stage where a card stops inside a cycle. `testing` stops on the stage right before the
 * pull request one (the last stage when there is none); `null` lets the card run into the pull
 * request stage, which holds it until the merge anyway.
 */
export function cycleHoldStageKey(
    config: Pick<BoardConfig, "stages">,
    until: CycleUntil
): string | null {
    if (until === "pull_request") {
        return null;
    }
    const pullRequest = findPullRequestStage(config);
    if (pullRequest === undefined) {
        return config.stages.at(-1)?.key ?? null;
    }
    const index = config.stages.findIndex(
        (stage) => stage.key === pullRequest.key
    );
    return config.stages[index - 1]?.key ?? null;
}

/**
 * What a stage result means for the card's cycle item: `null` while another stage of the
 * card was queued, the item's result once the card stops.
 */
export function cycleItemResult(
    card: { state: CardState },
    queuedNext: boolean
): CycleItemResult | null {
    if (queuedNext) {
        return null;
    }
    if (card.state === "waiting_input") {
        return "waiting_input";
    }
    return card.state === "failed" ? "failed" : "done";
}

function settle<Item extends CycleItemState>(
    items: Item[],
    event: CycleEvent,
    at: string
): { items: Item[]; settled: boolean } {
    let settled = false;
    const next = items.map((item) => {
        if (item.slug !== event.slug || item.status !== "running") {
            return item;
        }
        settled = true;
        return {
            ...item,
            status: event.result,
            code: event.code ?? item.code,
            endedAt: at,
        };
    });
    return { items: next, settled };
}

const skipPending = <Item extends CycleItemState>(
    items: Item[],
    at: string
): Item[] =>
    items.map((item) =>
        item.status === "pending"
            ? { ...item, status: "skipped" as const, endedAt: at }
            : item
    );

/**
 * Records an item's result and picks the items that start now. Pure: the caller writes the
 * cycle it returns and triggers `start`. Only `failed` counts as a failure; an item waiting
 * for a person or stopped by one leaves the cycle and the others go on.
 */
export function advanceCycle<Item extends CycleItemState>(
    cycle: CycleState<Item>,
    event: CycleEvent | null,
    at: string
): CycleAdvance<Item> {
    const settled =
        event === null
            ? { items: cycle.items, settled: false }
            : settle(cycle.items, event, at);
    if (cycle.status !== "running") {
        return {
            cycle: { ...cycle, items: settled.items },
            start: [],
            ended: false,
        };
    }
    if (
        settled.settled &&
        event?.result === "failed" &&
        cycle.options.onFailure === "stop"
    ) {
        return {
            cycle: {
                ...cycle,
                status: "stopped",
                endReason: "item_failed",
                items: skipPending(settled.items, at),
            },
            start: [],
            ended: true,
        };
    }

    const running = settled.items.filter(
        (item) => item.status === "running"
    ).length;
    let slots = Math.max(0, cycle.options.concurrency - running);
    const start: string[] = [];
    const items = settled.items.map((item) => {
        if (slots === 0 || item.status !== "pending") {
            return item;
        }
        slots -= 1;
        start.push(item.slug);
        return { ...item, status: "running" as const, startedAt: at };
    });
    const open = items.some(
        (item) => item.status === "pending" || item.status === "running"
    );
    if (open) {
        return { cycle: { ...cycle, items }, start, ended: false };
    }
    return {
        cycle: {
            ...cycle,
            status: "finished",
            endReason: "completed",
            items,
        },
        start: [],
        ended: true,
    };
}

/** A queued or running cycle stopped by a person: nothing pending starts, the running stop. */
export function stopCycleItems<Item extends CycleItemState>(
    items: Item[],
    at: string
): Item[] {
    return skipPending(items, at).map((item) =>
        item.status === "running"
            ? { ...item, status: "stopped" as const, endedAt: at }
            : item
    );
}

export const isCycleActive = (status: CycleStatus): boolean =>
    status === "queued" || status === "running";
