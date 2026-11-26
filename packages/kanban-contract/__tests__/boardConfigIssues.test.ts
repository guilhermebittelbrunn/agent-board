import { describe, expect, it } from "vitest";
import { parseBoardConfig } from "../src/boardConfig";
import { formatIssuePath, toBoardConfigIssues } from "../src/boardConfigIssues";

const stage = (key: string, extra: Record<string, unknown> = {}) => ({
    key,
    column: key.toUpperCase(),
    command: `/${key}`,
    ...extra,
});

const base = {
    version: 1,
    name: "board",
    stages: [stage("analyze"), stage("develop")],
};

function issuesOf(input: Record<string, unknown>) {
    const result = parseBoardConfig(input);
    if (result.success) {
        throw new Error("expected the config to fail");
    }
    return toBoardConfigIssues(result.error, input);
}

describe("formatIssuePath", () => {
    it("writes array indexes in brackets and keys with dots", () => {
        expect(formatIssuePath(["stages", 2, "onRework"])).toBe(
            "stages[2].onRework"
        );
        expect(formatIssuePath(["limits", "maxReworkLoops"])).toBe(
            "limits.maxReworkLoops"
        );
        expect(formatIssuePath([])).toBe("");
    });
});

describe("toBoardConfigIssues", () => {
    it("tells a missing field apart from a field of the wrong type", () => {
        const { name: _name, ...withoutName } = base;
        expect(issuesOf(withoutName)).toEqual([
            { path: "name", rule: "required", params: {} },
        ]);
        expect(issuesOf({ ...base, name: 3 })).toEqual([
            {
                path: "name",
                rule: "wrong_type",
                params: { expected: "string" },
            },
        ]);
    });

    it("maps size limits with their bound", () => {
        expect(issuesOf({ ...base, stages: [] })).toEqual([
            { path: "stages", rule: "too_small", params: { minimum: 1 } },
        ]);
        expect(issuesOf({ ...base, limits: { maxReworkLoops: 9 } })).toEqual([
            {
                path: "limits.maxReworkLoops",
                rule: "too_big",
                params: { maximum: 5 },
            },
        ]);
    });

    it("maps regex and includes checks to bad_format", () => {
        expect(
            issuesOf({
                ...base,
                branchPattern: "feat/x",
                stages: [stage("analyze", { command: "analyze" })],
            })
        ).toEqual([
            { path: "branchPattern", rule: "bad_format", params: {} },
            { path: "stages[0].command", rule: "bad_format", params: {} },
        ]);
    });

    it("lists the allowed values of enums and literals", () => {
        expect(
            issuesOf({
                ...base,
                version: 2,
                stages: [stage("analyze", { model: "gpt" })],
            })
        ).toEqual([
            {
                path: "version",
                rule: "not_allowed",
                params: { allowed: ["1"] },
            },
            {
                path: "stages[0].model",
                rule: "not_allowed",
                params: { allowed: ["opus", "sonnet", "haiku"] },
            },
        ]);
    });

    it("names the duplicated stage key", () => {
        expect(
            issuesOf({ ...base, stages: [stage("analyze"), stage("analyze")] })
        ).toEqual([
            {
                path: "stages[1].key",
                rule: "stage_key_duplicated",
                params: { key: "analyze" },
            },
        ]);
    });

    it("explains an invalid rework target with the previous stage as suggestion", () => {
        expect(
            issuesOf({
                ...base,
                stages: [
                    stage("analyze"),
                    stage("develop"),
                    stage("review", {
                        column: "Revisando",
                        onRework: "deploy",
                    }),
                ],
            })
        ).toEqual([
            {
                path: "stages[2].onRework",
                rule: "rework_target_invalid",
                params: {
                    stageColumn: "Revisando",
                    target: "deploy",
                    suggestion: "develop",
                },
            },
        ]);
    });

    it("leaves the suggestion out when the first stage points to itself", () => {
        expect(
            issuesOf({
                ...base,
                stages: [stage("analyze", { onRework: "analyze" })],
            })
        ).toEqual([
            {
                path: "stages[0].onRework",
                rule: "rework_target_invalid",
                params: { stageColumn: "ANALYZE", target: "analyze" },
            },
        ]);
    });

    it("names the unprotected base branch, default included", () => {
        expect(issuesOf({ ...base, protectedBranches: ["release"] })).toEqual([
            {
                path: "baseBranch",
                rule: "base_branch_unprotected",
                params: { baseBranch: "main" },
            },
        ]);
    });

    it("falls back to other for codes it does not know", () => {
        const input = { ...base };
        const result = parseBoardConfig(input);
        expect(result.success).toBe(true);

        const fake = {
            issues: [{ code: "invalid_union", path: ["stages"], message: "" }],
        };
        expect(
            toBoardConfigIssues(
                fake as unknown as Parameters<typeof toBoardConfigIssues>[0],
                input
            )
        ).toEqual([{ path: "stages", rule: "other", params: {} }]);
    });
});
