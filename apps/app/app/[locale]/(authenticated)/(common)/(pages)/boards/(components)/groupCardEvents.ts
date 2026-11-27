import { type BoardConfig, findStageConfig } from "@repo/kanban-contract";
import type { CardEventViewDTO } from "@repo/sdk/src/types";

export type CardEventGroupLabel =
    | { kind: "stage"; stageKey: string; column: string; loop: number }
    | { kind: "removed"; stageKey: string; loop: number }
    | { kind: "tasks" }
    | { kind: "done" };

export type CardEventGroup = {
    id: string;
    label: CardEventGroupLabel;
    /** Newest first. */
    events: CardEventViewDTO[];
};

const groupKeyOf = (event: CardEventViewDTO): string =>
    event.stageKey === null
        ? `lane:${event.lane === "done" ? "done" : "tasks"}`
        : `stage:${event.stageKey}`;

const byCreation = (left: CardEventViewDTO, right: CardEventViewDTO) =>
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id);

function labelOf(
    event: CardEventViewDTO,
    config: BoardConfig,
    loop: number
): CardEventGroupLabel {
    if (event.stageKey === null) {
        return event.lane === "done" ? { kind: "done" } : { kind: "tasks" };
    }
    const stage = findStageConfig(config, event.stageKey);
    return stage
        ? { kind: "stage", stageKey: stage.key, column: stage.column, loop }
        : { kind: "removed", stageKey: event.stageKey, loop };
}

/**
 * Groups the timeline by stage, newest group on top. Consecutive events of one stage form
 * a group; a stage that comes back after another one (a rework loop) opens a new group,
 * numbered by how many times that stage ran before.
 */
export function groupCardEvents(
    events: CardEventViewDTO[],
    config: BoardConfig
): CardEventGroup[] {
    const groups: (CardEventGroup & { key: string })[] = [];
    const runsByKey = new Map<string, number>();

    for (const event of [...events].sort(byCreation)) {
        const key = groupKeyOf(event);
        const current = groups.at(-1);
        if (current?.key === key) {
            current.events.push(event);
            continue;
        }
        const loop = runsByKey.get(key) ?? 0;
        runsByKey.set(key, loop + 1);
        groups.push({
            id: `${key}#${loop}`,
            key,
            label: labelOf(event, config, loop),
            events: [event],
        });
    }

    return groups.reverse().map(({ id, label, events: grouped }) => ({
        id,
        label,
        events: [...grouped].reverse(),
    }));
}
