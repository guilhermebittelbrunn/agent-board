import type { globalTranslations } from "@repo/internationalization/translations/global";
import { scheduledTaskInputSchema } from "@repo/kanban-contract";
import { z } from "zod";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

export type ScheduledTaskFormValues = { fireUrl: string; token: string };

const fieldAccepts = (field: "fireUrl" | "token", value: string) =>
    scheduledTaskInputSchema.shape[field].safeParse(value).success;

export function buildScheduledTaskFormSchema(dictionary: Dictionary) {
    const dialogCopy =
        dictionary.apps.app.pages.common.boards.credentials.cloud.dialog;

    return z.object({
        fireUrl: z
            .string()
            .trim()
            .refine((value) => fieldAccepts("fireUrl", value), {
                message: dialogCopy.fireUrlInvalid,
            }),
        token: z
            .string()
            .trim()
            .refine((value) => fieldAccepts("token", value), {
                message: dialogCopy.tokenInvalid,
            }),
    });
}
