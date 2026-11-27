import type { globalTranslations } from "@repo/internationalization/translations/global";
import {
    type CreateCycleInput,
    CYCLE_ON_FAILURE,
    CYCLE_UNTIL,
    MAX_CYCLE_SPECS,
} from "@repo/kanban-contract";
import { z } from "zod";
import { fillMessage } from "../(components)/boardConfigIssueMessage";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

export const CYCLE_CONCURRENCY_VALUES = ["1", "2"] as const;

export type NewCycleFormValues = {
    slugs: string[];
    until: (typeof CYCLE_UNTIL)[number];
    concurrency: (typeof CYCLE_CONCURRENCY_VALUES)[number];
    onFailure: (typeof CYCLE_ON_FAILURE)[number];
};

export const NEW_CYCLE_DEFAULTS: NewCycleFormValues = {
    slugs: [],
    until: "pull_request",
    concurrency: "1",
    onFailure: "skip",
};

export function buildNewCycleFormSchema(dictionary: Dictionary) {
    const validationCopy =
        dictionary.apps.app.pages.common.boards.cycles.new.validation;

    return z.object({
        slugs: z
            .array(z.string())
            .min(1, { message: validationCopy.specsRequired })
            .max(MAX_CYCLE_SPECS, {
                message: fillMessage(validationCopy.specsMax, {
                    max: MAX_CYCLE_SPECS,
                }),
            }),
        until: z.enum(CYCLE_UNTIL),
        concurrency: z.enum(CYCLE_CONCURRENCY_VALUES),
        onFailure: z.enum(CYCLE_ON_FAILURE),
    });
}

export const toCreateCycleRequest = (
    values: NewCycleFormValues
): CreateCycleInput => ({
    slugs: values.slugs,
    options: {
        until: values.until,
        concurrency: values.concurrency === "2" ? 2 : 1,
        onFailure: values.onFailure,
    },
});
