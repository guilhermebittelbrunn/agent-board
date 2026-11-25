import { z } from "zod";

const SLASH_COMMAND = /^\/[a-z][a-z0-9-]*$/;
const STAGE_KEY = /^[a-z][a-z0-9-]*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_PLACEHOLDER = "{slug}";
const DEFAULT_MAX_REWORK_LOOPS = 2;
const MAX_REWORK_LOOPS = 5;
const DEFAULT_MAX_TURNS_PER_STAGE = 200;

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
                });
            }
        }

        // Agents never commit on the base branch, so it has to be protected too.
        if (!config.protectedBranches.includes(config.baseBranch)) {
            ctx.addIssue({
                code: "custom",
                message: `baseBranch "${config.baseBranch}" must be listed in protectedBranches`,
                path: ["baseBranch"],
            });
        }
    });

export type StageConfig = z.infer<typeof stageConfigSchema>;
export type BoardConfig = z.infer<typeof boardConfigSchema>;

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
