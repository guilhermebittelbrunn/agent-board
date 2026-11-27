import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_PR_COMMENT_RUNS_PER_HOUR } from "../src/boardConfig";
import { parseBoardConfigYaml } from "../src/boardConfigYaml";

const KIT_BOARD_YML = readFileSync(
    fileURLToPath(new URL("../../../kit/.kanban/board.yml", import.meta.url)),
    "utf8"
);

describe("parseBoardConfigYaml", () => {
    it("reads the kit file, comments included, into a valid config", () => {
        const result = parseBoardConfigYaml(KIT_BOARD_YML);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.config.stages.map((stage) => stage.key)).toEqual([
            "analyze",
            "develop",
            "review",
            "test",
            "pr",
        ]);
        expect(result.config.stages[4]?.onPrComment).toBe("/mediate");
        expect(result.config.stages[4]?.pullRequest).toEqual({ draft: true });
        expect(result.config.limits.maxPrCommentRunsPerHour).toBe(
            DEFAULT_PR_COMMENT_RUNS_PER_HOUR
        );
        expect(result.config.environment.setupScript).toBe(".kanban/setup.sh");
    });

    it("reads this repository's own board.yml into a valid config", () => {
        const result = parseBoardConfigYaml(
            readFileSync(
                fileURLToPath(
                    new URL("../../../.kanban/board.yml", import.meta.url)
                ),
                "utf8"
            )
        );

        expect(result.ok).toBe(true);
    });

    it("reports broken syntax with line and column", () => {
        const result = parseBoardConfigYaml(
            "version: 1\nstages: [a,\nname: x\n"
        );

        expect(result).toMatchObject({
            ok: false,
            raw: null,
            issues: [{ path: "", rule: "yaml_syntax" }],
        });
        if (result.ok) {
            return;
        }
        expect(result.issues[0]?.params).toEqual({ line: 3, column: 1 });
    });

    it("refuses a duplicated key as a syntax error", () => {
        const result = parseBoardConfigYaml("version: 1\nname: a\nname: b\n");

        expect(result).toMatchObject({
            ok: false,
            issues: [{ rule: "yaml_syntax", params: { line: 3, column: 1 } }],
        });
    });

    it("refuses a root that is not a mapping", () => {
        for (const text of ["- version: 1\n", "just text\n", ""]) {
            expect(parseBoardConfigYaml(text)).toEqual({
                ok: false,
                raw: null,
                issues: [{ path: "", rule: "root_not_mapping", params: {} }],
            });
        }
    });

    it("refuses aliases that expand past the budget", () => {
        const bomb = [
            "a: &a [x, x, x, x, x, x, x, x, x]",
            "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]",
            "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]",
            "d: [*c, *c, *c, *c, *c, *c, *c, *c, *c]",
        ].join("\n");

        expect(parseBoardConfigYaml(bomb)).toEqual({
            ok: false,
            raw: null,
            issues: [{ path: "", rule: "yaml_syntax", params: {} }],
        });
    });

    it("keeps the raw object when the schema fails", () => {
        const result = parseBoardConfigYaml(
            "version: 1\nname: x\nstages:\n  - key: a\n    column: A\n    command: /a\n    onRework: z\n"
        );

        expect(result).toMatchObject({
            ok: false,
            raw: { name: "x" },
            issues: [
                { path: "stages[0].onRework", rule: "rework_target_invalid" },
            ],
        });
    });
});
