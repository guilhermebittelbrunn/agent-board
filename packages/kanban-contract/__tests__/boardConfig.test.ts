import { describe, expect, it } from "vitest";
import {
    DEFAULT_STAGE_TIMEOUT_MINUTES,
    MAX_STAGE_TIMEOUT_MINUTES,
    MIN_STAGE_TIMEOUT_MINUTES,
    parseBoardConfig,
    resolveBranchName,
} from "../src/boardConfig";

const minimalConfig = {
    version: 1,
    name: "next-boilerplate",
    stages: [
        { key: "analyze", column: "Análise", command: "/analyze" },
        { key: "develop", column: "Executando", command: "/develop" },
        {
            key: "review",
            column: "Revisando",
            command: "/review",
            onRework: "develop",
        },
    ],
};

describe("parseBoardConfig", () => {
    it("fills the defaults of a minimal config", () => {
        const result = parseBoardConfig(minimalConfig);

        expect(result.success).toBe(true);
        expect(result.data?.baseBranch).toBe("main");
        expect(result.data?.branchPattern).toBe("feat/{slug}");
        expect(result.data?.backlog.index).toBe("specs/BACKLOG.md");
        expect(result.data?.limits.maxReworkLoops).toBe(2);
        expect(result.data?.limits.stageTimeoutMinutes).toBe(
            DEFAULT_STAGE_TIMEOUT_MINUTES
        );
        expect(result.data?.stages[0]?.model).toBe("sonnet");
    });

    it("accepts a stage timeout from the minimum to the maximum minutes, whole", () => {
        const timeout = (stageTimeoutMinutes: number) =>
            parseBoardConfig({
                ...minimalConfig,
                limits: { stageTimeoutMinutes },
            }).success;

        expect(timeout(MIN_STAGE_TIMEOUT_MINUTES)).toBe(true);
        expect(timeout(MAX_STAGE_TIMEOUT_MINUTES)).toBe(true);
        expect(timeout(MIN_STAGE_TIMEOUT_MINUTES - 1)).toBe(false);
        expect(timeout(MAX_STAGE_TIMEOUT_MINUTES + 1)).toBe(false);
        const halfMinute = 0.5;
        expect(timeout(DEFAULT_STAGE_TIMEOUT_MINUTES + halfMinute)).toBe(false);
    });

    it("rejects duplicated stage keys", () => {
        const result = parseBoardConfig({
            ...minimalConfig,
            stages: [...minimalConfig.stages, minimalConfig.stages[0]],
        });

        expect(result.success).toBe(false);
    });

    it("rejects onRework pointing to a later stage", () => {
        const result = parseBoardConfig({
            ...minimalConfig,
            stages: [
                {
                    key: "analyze",
                    column: "Análise",
                    command: "/analyze",
                    onRework: "develop",
                },
                { key: "develop", column: "Executando", command: "/develop" },
            ],
        });

        expect(result.success).toBe(false);
    });

    it("rejects a base branch that is not protected", () => {
        const result = parseBoardConfig({
            ...minimalConfig,
            baseBranch: "develop",
        });

        expect(result.success).toBe(false);
    });

    it("rejects commands that are not slash commands", () => {
        const result = parseBoardConfig({
            ...minimalConfig,
            stages: [{ key: "analyze", column: "Análise", command: "analyze" }],
        });

        expect(result.success).toBe(false);
    });
});

describe("resolveBranchName", () => {
    const config = parseBoardConfig(minimalConfig);
    if (!config.success) {
        throw new Error("fixture must be valid");
    }

    it("applies the branch pattern to the card slug", () => {
        expect(resolveBranchName(config.data, "audit-log")).toBe(
            "feat/audit-log"
        );
    });

    it("refuses slugs that are not kebab-case", () => {
        expect(() => resolveBranchName(config.data, "Audit Log")).toThrow();
    });

    it("refuses a pattern that resolves to a protected branch", () => {
        const unsafe = { ...config.data, branchPattern: "{slug}" };

        expect(() => resolveBranchName(unsafe, "main")).toThrow();
    });
});
