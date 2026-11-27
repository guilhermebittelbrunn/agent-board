import { describe, expect, it } from "vitest";
import { type StageConfig, stageConfigSchema } from "../src/boardConfig";
import { diffBoardStages, isEmptyStagesDiff } from "../src/boardConfigDiff";

const stage = (key: string, extra: Partial<StageConfig> = {}): StageConfig =>
    stageConfigSchema.parse({
        key,
        column: key.toUpperCase(),
        command: `/${key}`,
        ...extra,
    });

const BEFORE = [stage("analyze"), stage("develop"), stage("review")];

describe("diffBoardStages", () => {
    it("reports nothing for the same stages", () => {
        const diff = diffBoardStages(
            BEFORE,
            BEFORE.map((s) => ({ ...s }))
        );

        expect(diff).toEqual({
            added: [],
            removed: [],
            changed: [],
            moved: false,
        });
        expect(isEmptyStagesDiff(diff)).toBe(true);
    });

    it("reports added and removed stages by key, without calling it a move", () => {
        const diff = diffBoardStages(BEFORE, [
            stage("analyze"),
            stage("review"),
            stage("deploy"),
        ]);

        expect(diff).toEqual({
            added: [{ key: "deploy", column: "DEPLOY" }],
            removed: [{ key: "develop", column: "DEVELOP" }],
            changed: [],
            moved: false,
        });
    });

    it("lists the fields that changed, arrays compared by value", () => {
        const diff = diffBoardStages(BEFORE, [
            stage("analyze"),
            stage("develop", { runners: ["local"] }),
            stage("review", {
                column: "Revisando",
                model: "opus",
                onRework: "develop",
            }),
        ]);

        expect(diff.changed).toEqual([
            { key: "develop", column: "DEVELOP", fields: ["runners"] },
            {
                key: "review",
                column: "Revisando",
                fields: ["column", "model", "onRework"],
            },
        ]);
        expect(diff.moved).toBe(false);
    });

    it("flags a reorder of the stages kept on both sides", () => {
        const diff = diffBoardStages(BEFORE, [
            stage("develop"),
            stage("analyze"),
            stage("review"),
        ]);

        expect(diff.moved).toBe(true);
        expect(isEmptyStagesDiff(diff)).toBe(false);
    });
});

describe("diffBoardStages with a pull request stage", () => {
    it("reports a changed draft setting", () => {
        const diff = diffBoardStages(
            [stage("pr", { pullRequest: { draft: true } })],
            [stage("pr", { pullRequest: { draft: false } })]
        );

        expect(diff.changed).toEqual([
            { key: "pr", column: "PR", fields: ["pullRequest"] },
        ]);
    });

    it("reports nothing for the same draft setting", () => {
        const diff = diffBoardStages(
            [stage("pr", { pullRequest: { draft: true } })],
            [stage("pr", { pullRequest: { draft: true } })]
        );

        expect(isEmptyStagesDiff(diff)).toBe(true);
    });
});
