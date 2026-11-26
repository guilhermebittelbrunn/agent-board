"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    HookFormInput,
    HookFormSwitch,
} from "@repo/design-system/components/form/hookform";
import { Form } from "@repo/design-system/components/ui/form";
import { getDictionary } from "@repo/internationalization/client";
import type { BoardViewDTO } from "@repo/sdk/src/types";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Footer } from "@/shared/components/ui/Footer";
import { SettingsSection } from "@/shared/components/ui/SettingsSection";
import {
    buildStageSettingsSchema,
    MAX_WIP_LIMIT,
    MIN_WIP_LIMIT,
    type StageSettingsFormValues,
    stageSettingsFormValues,
    toStageSettingsRequest,
} from "../(validations)/stageSettingsSchema";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type BoardStageSettingsFormProps = {
    board: BoardViewDTO;
    /** Only the owner edits; everyone else sees the values disabled. */
    canEdit: boolean;
    isSaving: boolean;
    onSave: (
        body: ReturnType<typeof toStageSettingsRequest>
    ) => Promise<unknown>;
    boardsDictionary: BoardsDictionary;
};

/** The board's own choices per stage: how many cards run at once and where it asks first. */
export function BoardStageSettingsForm({
    board,
    canEdit,
    isSaving,
    onSave,
    boardsDictionary,
}: BoardStageSettingsFormProps) {
    const { dictionary } = getDictionary();
    const settingsCopy = boardsDictionary.settings.stageSettings;
    const schema = useMemo(
        () => buildStageSettingsSchema(dictionary),
        [dictionary]
    );
    const initialValues = useMemo(
        () => stageSettingsFormValues(board.config, board.stageSettings),
        [board.config, board.stageSettings]
    );
    const form = useForm<StageSettingsFormValues>({
        resolver: zodResolver(schema),
        defaultValues: initialValues,
    });

    useEffect(() => {
        form.reset(initialValues);
    }, [form, initialValues]);

    const onSubmit = async (values: StageSettingsFormValues) => {
        try {
            await onSave(toStageSettingsRequest(values));
        } catch {
            // The mutation already showed the error; the values stay for a retry.
        }
    };

    return (
        <SettingsSection
            description={
                canEdit ? settingsCopy.description : settingsCopy.readOnly
            }
            title={settingsCopy.title}
        >
            <Form {...form}>
                <form
                    className="flex flex-col gap-4"
                    noValidate
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <ul className="flex flex-col divide-y">
                        {board.config.stages.map((stage, index) => (
                            <li
                                className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-[minmax(8rem,1fr)_10rem_minmax(12rem,1.5fr)] sm:items-start"
                                key={stage.key}
                            >
                                <span className="pt-1 font-medium text-sm">
                                    {stage.column}
                                </span>
                                <HookFormInput<StageSettingsFormValues>
                                    aria-label={fillMessage(
                                        settingsCopy.wipLimitLabel,
                                        { column: stage.column }
                                    )}
                                    disabled={!canEdit}
                                    inputMode="numeric"
                                    label={settingsCopy.wipLimit}
                                    max={MAX_WIP_LIMIT}
                                    min={MIN_WIP_LIMIT}
                                    name={`stages.${index}.wipLimit`}
                                    placeholder={settingsCopy.wipLimitHint}
                                    type="number"
                                />
                                {stage.approval === "optional" ? (
                                    <HookFormSwitch<StageSettingsFormValues>
                                        aria-label={fillMessage(
                                            settingsCopy.approvalGateLabel,
                                            { column: stage.column }
                                        )}
                                        disabled={!canEdit}
                                        label={settingsCopy.approvalGate}
                                        name={`stages.${index}.approvalGate`}
                                    />
                                ) : (
                                    <span className="pt-1 text-muted-foreground text-sm">
                                        {settingsCopy.approval}:{" "}
                                        {stage.approval === "required"
                                            ? settingsCopy.approvalAlways
                                            : settingsCopy.approvalNever}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {canEdit ? (
                        <Footer
                            confirmLabel={settingsCopy.save}
                            isLoading={isSaving}
                            showBack={false}
                            sticky={false}
                        />
                    ) : null}
                </form>
            </Form>
        </SettingsSection>
    );
}
