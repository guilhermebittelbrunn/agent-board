import type { CardEventViewDTO } from "@repo/sdk/src/types";

const START = Date.parse("2026-11-26T10:00:00.000Z");
const MS_PER_MINUTE = 60_000;

const BASE = {
    boardId: "agent-board-demo--sample-app",
    cardId: "agent-board-demo--sample-app__search-cards",
    runId: null,
    isOwn: false,
    author: { kind: "agent" as const, name: "planejador-tarefa" },
};

/** An event at minute `minute` of the card, in the stage given (`null` for Tasks or Done). */
export function updateAt(
    id: string,
    minute: number,
    stageKey: string | null,
    lane: CardEventViewDTO["lane"] = stageKey === null ? "tasks" : "stage"
): CardEventViewDTO {
    const at = new Date(START + minute * MS_PER_MINUTE).toISOString();
    return {
        ...BASE,
        id,
        stageKey,
        lane,
        type: "update",
        markdown: id,
        createdAt: at,
        updatedAt: at,
    };
}

export function artifactAt(
    id: string,
    minute: number,
    path: string,
    commitSha: string
): CardEventViewDTO {
    return {
        ...updateAt(id, minute, "analyze"),
        type: "artifact",
        artifact: { path, commitSha },
    } as CardEventViewDTO;
}
