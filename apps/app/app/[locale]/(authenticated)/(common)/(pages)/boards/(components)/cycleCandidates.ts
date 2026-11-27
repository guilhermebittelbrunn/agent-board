import type { CardDTO } from "@repo/sdk/src/types";

/** A spec a cycle may take: ready in Tasks, running nothing and in no other cycle. */
export const isCycleCandidate = (
    card: Pick<CardDTO, "lane" | "ready" | "orphan" | "activeRunId" | "cycleId">
): boolean =>
    card.lane === "tasks" &&
    card.ready &&
    !card.orphan &&
    card.activeRunId === null &&
    card.cycleId === null;
