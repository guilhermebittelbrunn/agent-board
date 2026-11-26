import { parseBoardConfig } from "@repo/kanban-contract";
import type { BoardViewDTO, CardDTO } from "@repo/sdk/src/types";

const parsed = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [
        {
            key: "analyze",
            column: "Análise",
            command: "/analyze",
            model: "opus",
            effort: "high",
            approval: "optional",
        },
        { key: "develop", column: "Executando", command: "/develop" },
        {
            key: "review",
            column: "Revisando",
            command: "/review",
            onRework: "develop",
        },
    ],
});
if (!parsed.success) {
    throw new Error("invalid config");
}
export const RUN_CONFIG = parsed.data;

export const runBoard = (
    overrides: Partial<BoardViewDTO> = {}
): Pick<BoardViewDTO, "config" | "executor" | "stageSettings"> => ({
    config: RUN_CONFIG,
    executor: "fake",
    stageSettings: {},
    ...overrides,
});

export const runCard = (
    slug: string,
    overrides: Partial<CardDTO> = {}
): CardDTO => ({
    id: `b__${slug}`,
    boardId: "b",
    slug,
    title: `Título ${slug}`,
    spec: { path: `specs/${slug}.md`, sha: "x", status: "approved" },
    ready: true,
    orphan: false,
    lane: "stage",
    stageKey: "analyze",
    state: "idle",
    pendingAsk: null,
    activeRunId: null,
    lastRun: null,
    reworkLoops: 0,
    order: 0,
    branch: `feat/${slug}`,
    movedAt: null,
    syncedAt: "2026-11-26T10:00:00.000Z",
    createdAt: "2026-11-26T10:00:00.000Z",
    updatedAt: "2026-11-26T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
});
