"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    HookFormInput,
    HookFormInputPassword,
} from "@repo/design-system/components/form/hookform";
import { Button } from "@repo/design-system/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Form } from "@repo/design-system/components/ui/form";
import { getDictionary } from "@repo/internationalization/client";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import type { ScheduledTaskTarget } from "../(hooks)/useBoardCredentialCrud";
import {
    buildScheduledTaskFormSchema,
    type ScheduledTaskFormValues,
} from "../(validations)/scheduledTaskSchema";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type ScheduledTaskDialogProps = {
    target: ScheduledTaskTarget | null;
    isSaving: boolean;
    boardsDictionary: BoardsDictionary;
    onSave: (
        target: ScheduledTaskTarget,
        values: ScheduledTaskFormValues
    ) => Promise<unknown>;
    onClose: () => void;
};

const EMPTY: ScheduledTaskFormValues = { fireUrl: "", token: "" };

export function ScheduledTaskDialog({
    target,
    isSaving,
    boardsDictionary,
    onSave,
    onClose,
}: ScheduledTaskDialogProps) {
    const { dictionary } = getDictionary();
    const dialogCopy = boardsDictionary.credentials.cloud.dialog;
    const schema = useMemo(
        () => buildScheduledTaskFormSchema(dictionary),
        [dictionary]
    );
    const form = useForm<ScheduledTaskFormValues>({
        resolver: zodResolver(schema),
        defaultValues: EMPTY,
    });

    const close = () => {
        form.reset(EMPTY);
        onClose();
    };

    const onSubmit = async (values: ScheduledTaskFormValues) => {
        if (!target) {
            return;
        }
        try {
            await onSave(target, values);
            close();
        } catch {
            // The mutation already showed the error; the typed values stay for a retry.
        }
    };

    return (
        <Dialog
            onOpenChange={(open) => {
                if (!(open || isSaving)) {
                    close();
                }
            }}
            open={target !== null}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {fillMessage(dialogCopy.title, {
                            stage: target?.column ?? "",
                        })}
                    </DialogTitle>
                    <DialogDescription>
                        {dialogCopy.description}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        className="flex flex-col gap-4"
                        noValidate
                        onSubmit={form.handleSubmit(onSubmit)}
                    >
                        <HookFormInput<ScheduledTaskFormValues>
                            autoCapitalize="none"
                            autoComplete="off"
                            label={dialogCopy.fireUrl}
                            name="fireUrl"
                            placeholder={dialogCopy.fireUrlPlaceholder}
                            required
                            spellCheck={false}
                            type="url"
                        />
                        <HookFormInputPassword<ScheduledTaskFormValues>
                            autoCapitalize="none"
                            autoComplete="off"
                            label={dialogCopy.token}
                            name="token"
                            required
                            spellCheck={false}
                        />
                        <DialogFooter>
                            <Button
                                disabled={isSaving}
                                onClick={close}
                                type="button"
                                variant="outline"
                            >
                                {dialogCopy.cancel}
                            </Button>
                            <Button loading={isSaving} type="submit">
                                {isSaving ? dialogCopy.saving : dialogCopy.save}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
