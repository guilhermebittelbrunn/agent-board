import { parseBoardConfig } from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import { describe, expect, it } from "vitest";
import {
    groupCardsByColumn,
    moveTargetOf,
    reorderedSlugs,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/groupCardsByColumn";

const config = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [
        { key: "analyze", column: "Análise", command: "/analyze" },
        { key: "develop", column: "Executando", command: "/develop" },
    ],
}).data;
if (!config) {
    throw new Error("invalid config");
}

const card = (slug: string, overrides: Partial<CardDTO> = {}): CardDTO => ({
    id: `b__${slug}`,
    boardId: "b",
    slug,
    title: slug,
    spec: { path: `specs/${slug}.md`, sha: "x", status: "approved", ref: null },
    ready: true,
    orphan: false,
    lane: "tasks",
    origin: "repository",
    request: null,
    specApproval: null,
    stageKey: null,
    state: "idle",
    pendingAsk: null,
    activeRunId: null,
    lastRun: null,
    reworkLoops: 0,
    order: 0,
    branch: null,
    movedAt: null,
    syncedAt: "2026-11-26T10:00:00.000Z",
    createdAt: "2026-11-26T10:00:00.000Z",
    updatedAt: "2026-11-26T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
});

const slugsByColumn = (cards: CardDTO[]) =>
    groupCardsByColumn(cards, config).columns.map(
        ({ column, cards: inColumn }) => [
            column.id,
            inColumn.map((item) => item.slug),
        ]
    );

describe("groupCardsByColumn", () => {
    it("puts Drafts, then Tasks in the board's order, then each stage, then Done", () => {
        expect(
            slugsByColumn([
                card("b", { order: 1 }),
                card("a", { order: 0 }),
                card("c", { lane: "stage", stageKey: "develop" }),
                card("d", { lane: "done" }),
            ])
        ).toEqual([
            ["drafts", []],
            ["tasks", ["a", "b"]],
            ["stage:analyze", []],
            ["stage:develop", ["c"]],
            ["done", ["d"]],
        ]);
    });

    it("keeps cards that are not ready out of the columns", () => {
        const grouped = groupCardsByColumn(
            [
                card("ready"),
                card("proposed", { ready: false }),
                card("orphan", { ready: false, orphan: true, order: 3 }),
            ],
            config
        );

        expect(grouped.columns[1]?.cards.map((item) => item.slug)).toEqual([
            "ready",
        ]);
        expect(grouped.notReady.map((item) => item.slug)).toEqual([
            "proposed",
            "orphan",
        ]);
    });

    it("lists drafts newest first, in a column nobody drops into", () => {
        const grouped = groupCardsByColumn(
            [
                card("older", {
                    lane: "drafts",
                    stageKey: "spec",
                    ready: false,
                    createdAt: "2026-11-26T09:00:00.000Z",
                }),
                card("newer", {
                    lane: "drafts",
                    stageKey: "spec",
                    ready: false,
                    createdAt: "2026-11-26T12:00:00.000Z",
                }),
            ],
            config
        );
        const drafts = grouped.columns[0];

        expect(drafts?.column.id).toBe("drafts");
        expect(drafts?.cards.map((item) => item.slug)).toEqual([
            "newer",
            "older",
        ]);
        expect(drafts && moveTargetOf(drafts.column)).toBeNull();
        expect(grouped.notReady).toEqual([]);
    });

    it("orders stage columns by the oldest move first", () => {
        expect(
            slugsByColumn([
                card("late", {
                    lane: "done",
                    movedAt: "2026-11-26T12:00:00.000Z",
                }),
                card("early", {
                    lane: "done",
                    movedAt: "2026-11-26T09:00:00.000Z",
                }),
            ]).at(-1)
        ).toEqual(["done", ["early", "late"]]);
    });

    it("gives a card in a removed stage its own column instead of dropping it", () => {
        const grouped = groupCardsByColumn(
            [card("lost", { lane: "stage", stageKey: "deploy" })],
            config
        );
        const removed = grouped.columns.at(-2);

        expect(removed?.column).toMatchObject({
            id: "removed:deploy",
            removed: true,
        });
        expect(removed?.cards.map((item) => item.slug)).toEqual(["lost"]);
        expect(removed && moveTargetOf(removed.column)).toBeNull();
    });
});

describe("reorderedSlugs", () => {
    const queue = [card("a"), card("b"), card("c")];

    it("moves a slug to the new index", () => {
        expect(reorderedSlugs(queue, "c", 0)).toEqual(["c", "a", "b"]);
        expect(reorderedSlugs(queue, "a", 1)).toEqual(["b", "a", "c"]);
    });

    it("returns null when the card stays where it is", () => {
        expect(reorderedSlugs(queue, "a", 0)).toBeNull();
        expect(reorderedSlugs(queue, "nope", 0)).toBeNull();
    });
});
