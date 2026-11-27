import { z } from "zod";

const SLASH_COMMAND = /^\/[a-z][a-z0-9-]*$/;
const STAGE_KEY = /^[a-z][a-z0-9-]*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_PLACEHOLDER = "{slug}";
const DEFAULT_MAX_REWORK_LOOPS = 2;
const MAX_REWORK_LOOPS = 5;
const DEFAULT_MAX_TURNS_PER_STAGE = 200;
export const DEFAULT_STAGE_TIMEOUT_MINUTES = 45;
export const MIN_STAGE_TIMEOUT_MINUTES = 5;
export const MAX_STAGE_TIMEOUT_MINUTES = 240;

export const DEFAULT_PROTECTED_BRANCHES = [
    "main",
    "master",
    "production",
    "production-backup",
] as const;

export const modelAliasSchema = z.enum(["opus", "sonnet", "haiku"]);
export const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);
export const runnerKindSchema = z.enum(["local", "cloud", "github-actions"]);
export const stageApprovalSchema = z.enum(["none", "optional", "required"]);

/** The stage that writes a spec in the Drafts column; no `stages[]` entry may take this key. */
export const SPEC_STAGE_KEY = "spec";

export const specAuthoringConfigSchema = z
    .object({
        command: z.string().regex(SLASH_COMMAND).default("/spec"),
        agent: z.string().min(1).default("estrategista-produto"),
        model: modelAliasSchema.default("opus"),
        effort: effortSchema.default("high"),
        runners: z.array(runnerKindSchema).min(1).default(["local", "cloud"]),
        path: z
            .string()
            .includes(SLUG_PLACEHOLDER)
            .default(`specs/features/${SLUG_PLACEHOLDER}.md`),
    })
    .prefault({});

export const stageConfigSchema = z.object({
    key: z.string().regex(STAGE_KEY),
    column: z.string().min(1),
    command: z.string().regex(SLASH_COMMAND),
    agent: z.string().min(1).optional(),
    model: modelAliasSchema.default("sonnet"),
    effort: effortSchema.default("medium"),
    runners: z.array(runnerKindSchema).min(1).default(["local", "cloud"]),
    approval: stageApprovalSchema.default("none"),
    onRework: z.string().regex(STAGE_KEY).optional(),
    onPrComment: z.string().regex(SLASH_COMMAND).optional(),
});

export const boardConfigSchema = z
    .object({
        version: z.literal(1),
        name: z.string().min(1),
        baseBranch: z.string().min(1).default("main"),
        protectedBranches: z
            .array(z.string().min(1))
            .min(1)
            .default([...DEFAULT_PROTECTED_BRANCHES]),
        branchPattern: z
            .string()
            .includes(SLUG_PLACEHOLDER)
            .default(`feat/${SLUG_PLACEHOLDER}`),
        backlog: z
            .object({
                source: z.enum(["specs", "manual"]).default("specs"),
                index: z.string().min(1).default("specs/BACKLOG.md"),
                readyStatus: z.string().min(1).default("approved"),
            })
            .prefault({}),
        featuresDir: z.string().min(1).default("docs/features"),
        stages: z.array(stageConfigSchema).min(1),
        specAuthoring: specAuthoringConfigSchema,
        limits: z
            .object({
                maxReworkLoops: z
                    .number()
                    .int()
                    .min(0)
                    .max(MAX_REWORK_LOOPS)
                    .default(DEFAULT_MAX_REWORK_LOOPS),
                maxTurnsPerStage: z
                    .number()
                    .int()
                    .positive()
                    .default(DEFAULT_MAX_TURNS_PER_STAGE),
                stageTimeoutMinutes: z
                    .number()
                    .int()
                    .min(MIN_STAGE_TIMEOUT_MINUTES)
                    .max(MAX_STAGE_TIMEOUT_MINUTES)
                    .default(DEFAULT_STAGE_TIMEOUT_MINUTES),
            })
            .prefault({}),
        environment: z
            .object({
                install: z.string().min(1).optional(),
                setupScript: z.string().min(1).optional(),
            })
            .prefault({}),
    })
    .superRefine((config, ctx) => {
        const stageKeys = config.stages.map((stage) => stage.key);

        for (const [index, key] of stageKeys.entries()) {
            if (stageKeys.indexOf(key) !== index) {
                ctx.addIssue({
                    code: "custom",
                    message: `Duplicated stage key "${key}"`,
                    path: ["stages", index, "key"],
                    params: { rule: "stage_key_duplicated", key },
                });
            }
        }

        for (const [index, key] of stageKeys.entries()) {
            if (key === SPEC_STAGE_KEY) {
                ctx.addIssue({
                    code: "custom",
                    message: `Stage key "${key}" is reserved for spec authoring`,
                    path: ["stages", index, "key"],
                    params: { rule: "stage_key_reserved", key },
                });
            }
        }

        for (const [index, stage] of config.stages.entries()) {
            if (stage.onRework === undefined) {
                continue;
            }
            const target = stageKeys.indexOf(stage.onRework);
            if (target === -1 || target >= index) {
                ctx.addIssue({
                    code: "custom",
                    message: `onRework of "${stage.key}" must point to an earlier stage`,
                    path: ["stages", index, "onRework"],
                    params: {
                        rule: "rework_target_invalid",
                        stageColumn: stage.column,
                        target: stage.onRework,
                        suggestion: config.stages[index - 1]?.key ?? null,
                    },
                });
            }
        }

        // Agents never commit on the base branch, so it has to be protected too.
        if (!config.protectedBranches.includes(config.baseBranch)) {
            ctx.addIssue({
                code: "custom",
                message: `baseBranch "${config.baseBranch}" must be listed in protectedBranches`,
                path: ["baseBranch"],
                params: {
                    rule: "base_branch_unprotected",
                    baseBranch: config.baseBranch,
                },
            });
        }
    });

export type StageConfig = z.infer<typeof stageConfigSchema>;
export type BoardConfig = z.infer<typeof boardConfigSchema>;
export type SpecAuthoringConfig = z.infer<typeof specAuthoringConfigSchema>;

export function parseBoardConfig(input: unknown) {
    return boardConfigSchema.safeParse(input);
}

export function isValidSlug(slug: string): boolean {
    return SLUG.test(slug);
}

export function resolveBranchName(config: BoardConfig, slug: string): string {
    if (!isValidSlug(slug)) {
        throw new Error(`Invalid card slug "${slug}"`);
    }
    const branch = config.branchPattern.replaceAll(SLUG_PLACEHOLDER, slug);
    if (config.protectedBranches.includes(branch)) {
        throw new Error(`Branch "${branch}" is protected`);
    }
    return branch;
}
