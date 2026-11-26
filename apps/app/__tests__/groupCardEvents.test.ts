import { parseBoardConfig } from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import { groupCardEvents } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/groupCardEvents";
import { updateAt } from "./cardEventFixtures";

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

describe("groupCardEvents", () => {
    it("groups by stage, newest group and newest event on top", () => {
        const groups = groupCardEvents(
            [
                updateAt("a1", 0, "analyze"),
                updateAt("a2", 1, "analyze"),
                updateAt("d1", 2, "develop"),
            ],
            config
        );

        expect(groups.map((group) => group.label)).toEqual([
            {
                kind: "stage",
                stageKey: "develop",
                column: "Executando",
                loop: 0,
            },
            { kind: "stage", stageKey: "analyze", column: "Análise", loop: 0 },
        ]);
        expect(groups[1]?.events.map((event) => event.id)).toEqual([
            "a2",
            "a1",
        ]);
    });

    it("sorts by creation even when the list comes out of order", () => {
        const groups = groupCardEvents(
            [updateAt("a2", 2, "analyze"), updateAt("a1", 1, "analyze")],
            config
        );

        expect(groups[0]?.events.map((event) => event.id)).toEqual([
            "a2",
            "a1",
        ]);
    });

    it("puts events without a stage in Tasks or Done by their lane", () => {
        const groups = groupCardEvents(
            [
                updateAt("t1", 0, null, "tasks"),
                updateAt("a1", 1, "analyze"),
                updateAt("x1", 2, null, "done"),
            ],
            config
        );

        expect(groups.map((group) => group.label.kind)).toEqual([
            "done",
            "stage",
            "tasks",
        ]);
    });

    it("keeps events of a stage that left board.yml", () => {
        const groups = groupCardEvents([updateAt("l1", 1, "legacy")], config);

        expect(groups[0]?.label).toEqual({
            kind: "removed",
            stageKey: "legacy",
            loop: 0,
        });
        expect(groups[0]?.events).toHaveLength(1);
    });

    it("opens a new group when a stage comes back after another one", () => {
        const groups = groupCardEvents(
            [
                updateAt("d1", 0, "develop"),
                updateAt("r1", 1, "analyze"),
                updateAt("d2", 2, "develop"),
            ],
            config
        );

        expect(groups.map((group) => group.label)).toEqual([
            {
                kind: "stage",
                stageKey: "develop",
                column: "Executando",
                loop: 1,
            },
            { kind: "stage", stageKey: "analyze", column: "Análise", loop: 0 },
            {
                kind: "stage",
                stageKey: "develop",
                column: "Executando",
                loop: 0,
            },
        ]);
        expect(new Set(groups.map((group) => group.id)).size).toBe(
            groups.length
        );
    });

    it("returns nothing for a card without events", () => {
        expect(groupCardEvents([], config)).toEqual([]);
    });
});
