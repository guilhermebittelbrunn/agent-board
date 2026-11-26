import type { globalTranslations } from "@repo/internationalization/translations/global";
import type { BoardConfig } from "@repo/kanban-contract";
import type {
    BoardStageSettingsDTO,
    UpdateBoardStageSettingsRequest,
} from "@repo/sdk/src/types";
import { z } from "zod";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

/** Mirrors the API: a whole number from 1 to 20, or nothing for no limit. */
export const MIN_WIP_LIMIT = 1;
export const MAX_WIP_LIMIT = 20;
const WHOLE_NUMBER = /^\d+$/;

export type StageSettingsFormValues = {
    stages: { key: string; wipLimit: string; approvalGate: boolean }[];
};

export function buildStageSettingsSchema(dictionary: Dictionary) {
    const settingsCopy =
        dictionary.apps.app.pages.common.boards.settings.stageSettings;
    const wipLimit = z
        .string()
        .trim()
        .refine(
            (value) => {
                if (value === "") {
                    return true;
                }
                const limit = Number(value);
                return (
                    WHOLE_NUMBER.test(value) &&
                    limit >= MIN_WIP_LIMIT &&
                    limit <= MAX_WIP_LIMIT
                );
            },
            { message: settingsCopy.wipLimitInvalid }
        );

    return z.object({
        stages: z.array(
            z.object({ key: z.string(), wipLimit, approvalGate: z.boolean() })
        ),
    });
}

export function stageSettingsFormValues(
    config: BoardConfig,
    settings: BoardStageSettingsDTO
): StageSettingsFormValues {
    return {
        stages: config.stages.map((stage) => ({
            key: stage.key,
            wipLimit: String(settings[stage.key]?.wipLimit ?? ""),
            approvalGate: settings[stage.key]?.approvalGate ?? false,
        })),
    };
}

export function toStageSettingsRequest(
    values: StageSettingsFormValues
): UpdateBoardStageSettingsRequest {
    return {
        stages: Object.fromEntries(
            values.stages.map((stage) => [
                stage.key,
                {
                    wipLimit:
                        stage.wipLimit.trim() === ""
                            ? null
                            : Number(stage.wipLimit),
                    approvalGate: stage.approvalGate,
                },
            ])
        ),
    };
}
