import type { z } from "zod";

export const BOARD_CONFIG_ISSUE_RULES = [
    "required",
    "wrong_type",
    "too_small",
    "too_big",
    "bad_format",
    "not_allowed",
    "stage_key_duplicated",
    "stage_key_reserved",
    "rework_target_invalid",
    "base_branch_unprotected",
    "yaml_syntax",
    "root_not_mapping",
    "other",
] as const;

export type BoardConfigIssueRule = (typeof BOARD_CONFIG_ISSUE_RULES)[number];

export type BoardConfigIssueParamValue = string | number | string[];

/**
 * One problem of a `board.yml`, in a shape the panel can translate: `rule` is stable
 * across Zod versions, and `path` reads like the file (`stages[2].onRework`, `""` for
 * the whole file).
 */
export type BoardConfigIssue = {
    path: string;
    rule: BoardConfigIssueRule;
    params: Record<string, BoardConfigIssueParamValue>;
};

const RULES_FROM_REFINEMENTS = new Set<BoardConfigIssueRule>([
    "stage_key_duplicated",
    "stage_key_reserved",
    "rework_target_invalid",
    "base_branch_unprotected",
]);

export function formatIssuePath(path: readonly PropertyKey[]): string {
    let formatted = "";
    for (const segment of path) {
        if (typeof segment === "number") {
            formatted += `[${segment}]`;
        } else {
            const name = String(segment);
            formatted += formatted === "" ? name : `.${name}`;
        }
    }
    return formatted;
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
    let current: unknown = input;
    for (const segment of path) {
        if (current === null || typeof current !== "object") {
            return;
        }
        current = (current as Record<PropertyKey, unknown>)[segment];
    }
    return current;
}

function isParamValue(value: unknown): value is BoardConfigIssueParamValue {
    return (
        typeof value === "string" ||
        typeof value === "number" ||
        (Array.isArray(value) &&
            value.every((item) => typeof item === "string"))
    );
}

function refinementIssue(
    issue: z.core.$ZodIssueCustom,
    path: string
): BoardConfigIssue {
    const { rule, ...rest } = (issue.params ?? {}) as Record<string, unknown>;
    if (
        typeof rule !== "string" ||
        !RULES_FROM_REFINEMENTS.has(rule as BoardConfigIssueRule)
    ) {
        return { path, rule: "other", params: {} };
    }

    const params: Record<string, BoardConfigIssueParamValue> = {};
    for (const [key, value] of Object.entries(rest)) {
        if (isParamValue(value)) {
            params[key] = value;
        }
    }
    return { path, rule: rule as BoardConfigIssueRule, params };
}

function toIssue(issue: z.core.$ZodIssue, input: unknown): BoardConfigIssue {
    const path = formatIssuePath(issue.path);

    switch (issue.code) {
        case "invalid_type":
            return valueAt(input, issue.path) === undefined
                ? { path, rule: "required", params: {} }
                : {
                      path,
                      rule: "wrong_type",
                      params: { expected: String(issue.expected) },
                  };
        case "too_small":
            return {
                path,
                rule: "too_small",
                params: { minimum: Number(issue.minimum) },
            };
        case "too_big":
            return {
                path,
                rule: "too_big",
                params: { maximum: Number(issue.maximum) },
            };
        case "invalid_format":
            return { path, rule: "bad_format", params: {} };
        case "invalid_value":
            return {
                path,
                rule: "not_allowed",
                params: { allowed: issue.values.map((value) => String(value)) },
            };
        case "custom":
            return refinementIssue(issue, path);
        default:
            return { path, rule: "other", params: {} };
    }
}

export function toBoardConfigIssues(
    error: z.ZodError,
    input: unknown
): BoardConfigIssue[] {
    return error.issues.map((issue) =>
        toIssue(issue as z.core.$ZodIssue, input)
    );
}
