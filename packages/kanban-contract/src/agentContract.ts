import { z } from "zod";
import { STAGE_OUTCOMES } from "./cardState";

const MAX_MARKDOWN = 20_000;
const MAX_HEADER = 24;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_QUESTIONS = 4;
const MAX_TITLE = 140;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

const cardRef = { cardId: z.string().min(1) };
const stageRef = { ...cardRef, stage: z.string().min(1) };

export const questionSchema = z.object({
    question: z.string().min(1),
    header: z.string().min(1).max(MAX_HEADER),
    options: z
        .array(
            z.object({
                label: z.string().min(1),
                description: z.string().optional(),
            })
        )
        .min(MIN_OPTIONS)
        .max(MAX_OPTIONS),
    recommended: z
        .number()
        .int()
        .min(0)
        .max(MAX_OPTIONS - 1)
        .optional(),
});

export const getCardInputSchema = z.object(cardRef);

export const postUpdateInputSchema = z.object({
    ...stageRef,
    markdown: z.string().min(1).max(MAX_MARKDOWN),
});

export const askInputSchema = z.object({
    ...stageRef,
    questions: z.array(questionSchema).min(1).max(MAX_QUESTIONS),
});

export const attachArtifactInputSchema = z.object({
    ...stageRef,
    path: z.string().min(1),
    commitSha: z.string().regex(COMMIT_SHA),
});

export const completeStageInputSchema = z.object({
    ...stageRef,
    outcome: z.enum(STAGE_OUTCOMES),
    summary: z.string().min(1).max(MAX_MARKDOWN),
});

export const createCardInputSchema = z.object({
    boardId: z.string().min(1),
    title: z.string().min(1).max(MAX_TITLE),
    specMarkdown: z.string().min(1).max(MAX_MARKDOWN),
    parentCardId: z.string().min(1).optional(),
});

export const AGENT_CONTRACT_TOOLS = {
    get_card: getCardInputSchema,
    post_update: postUpdateInputSchema,
    ask: askInputSchema,
    attach_artifact: attachArtifactInputSchema,
    complete_stage: completeStageInputSchema,
    create_card: createCardInputSchema,
} as const;

export type AgentContractTool = keyof typeof AGENT_CONTRACT_TOOLS;
export type AskInput = z.infer<typeof askInputSchema>;
export type CompleteStageInput = z.infer<typeof completeStageInputSchema>;
