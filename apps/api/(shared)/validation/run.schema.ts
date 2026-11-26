import type {
    TriggerStageRequest,
    UpdateBoardStageSettingsRequest,
} from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { z } from "zod";

const STAGE_KEY = /^[a-z][a-z0-9-]*$/;
export const MIN_WIP_LIMIT = 1;
export const MAX_WIP_LIMIT = 20;
const MAX_STAGES = 50;

const triggerStageSchema = z.object({
    stageKey: z.string().regex(STAGE_KEY),
});

const stageSettingsSchema = z.object({
    stages: z
        .record(
            z.string().regex(STAGE_KEY),
            z.object({
                wipLimit: z
                    .number()
                    .int()
                    .min(MIN_WIP_LIMIT)
                    .max(MAX_WIP_LIMIT)
                    .nullable(),
                approvalGate: z.boolean(),
            })
        )
        .refine((stages) => Object.keys(stages).length <= MAX_STAGES),
});

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const validationFailed = (): { ok: false; response: Response } => ({
    ok: false,
    response: Response.json(
        { error: { code: "VALIDATION_FAILED" } },
        { status: HTTP_STATUS.BAD_REQUEST }
    ),
});

export function parseTriggerStage(body: unknown): Parsed<TriggerStageRequest> {
    const parsed = triggerStageSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}

export function parseStageSettings(
    body: unknown
): Parsed<UpdateBoardStageSettingsRequest> {
    const parsed = stageSettingsSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}
