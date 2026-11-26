import type { CardEventViewDTO } from "@repo/sdk/src/types";

export type CardArtifactEvent = Extract<CardEventViewDTO, { type: "artifact" }>;

/** One entry per file, the most recent attachment winning, newest first. */
export function latestArtifacts(
    events: CardEventViewDTO[]
): CardArtifactEvent[] {
    const byPath = new Map<string, CardArtifactEvent>();
    for (const event of events) {
        if (event.type !== "artifact") {
            continue;
        }
        const known = byPath.get(event.artifact.path);
        if (
            known === undefined ||
            known.createdAt.localeCompare(event.createdAt) <= 0
        ) {
            byPath.set(event.artifact.path, event);
        }
    }
    return [...byPath.values()].sort(
        (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id)
    );
}
