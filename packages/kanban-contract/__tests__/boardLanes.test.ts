import { describe, expect, it } from "vitest";
import { parseBoardConfig } from "../src/boardConfig";
import { boardColumns, isCardReady } from "../src/boardLanes";

const config = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [
        {
            key: "analyze",
            column: "Análise",
            command: "/analyze",
            model: "opus",
            effort: "high",
        },
        { key: "develop", column: "Executando", command: "/develop" },
    ],
});

describe("boardColumns", () => {
    it("puts Tasks first, one column per stage in file order, then Done", () => {
        if (!config.success) {
            throw config.error;
        }
        expect(boardColumns(config.data)).toEqual([
            { id: "tasks", lane: "tasks" },
            {
                id: "stage:analyze",
                lane: "stage",
                stageKey: "analyze",
                title: "Análise",
                command: "/analyze",
                model: "opus",
                effort: "high",
            },
            {
                id: "stage:develop",
                lane: "stage",
                stageKey: "develop",
                title: "Executando",
                command: "/develop",
                model: "sonnet",
                effort: "medium",
            },
            { id: "done", lane: "done" },
        ]);
    });
});

describe("isCardReady", () => {
    it("is ready only with the ready status", () => {
        expect(isCardReady("approved", "approved", false)).toBe(true);
        expect(isCardReady("proposed", "approved", false)).toBe(false);
    });

    it("never treats an orphan card as ready", () => {
        expect(isCardReady("approved", "approved", true)).toBe(false);
    });
});
