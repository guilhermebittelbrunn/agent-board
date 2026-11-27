"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HookFormTextarea } from "@repo/design-system/components/form/hookform";
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
import { ATTACHMENTS_PER_DRAFT } from "@repo/kanban-contract";
import type { BoardViewDTO, UploadedAttachmentDTO } from "@repo/sdk/src/types";
import { PaperclipIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSpecDraftCrud } from "../(hooks)/useSpecDraftCrud";
import {
    ATTACHMENT_ACCEPT,
    ATTACHMENT_MAX_MB,
    attachmentFileError,
    buildNewSpecFormSchema,
    type NewSpecFormValues,
} from "../(validations)/newSpecSchema";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import {
    DraftAttachmentList,
    type DraftAttachmentStatus,
} from "./DraftAttachmentList";

type PickedAttachment = {
    key: string;
    file: File;
    status: DraftAttachmentStatus;
    error: string | null;
    uploaded: UploadedAttachmentDTO | null;
};

type NewSpecDialogProps = {
    board: BoardViewDTO;
    open: boolean;
    boardsDictionary: BoardsDictionary;
    onOpenChange: (open: boolean) => void;
    onCreated: (slug: string) => void;
};

let pickCounter = 0;
const nextKey = () => {
    pickCounter += 1;
    return `attachment-${pickCounter}`;
};

function RunsOnLine({
    board,
    boardsDictionary,
}: {
    board: BoardViewDTO;
    boardsDictionary: BoardsDictionary;
}) {
    const newSpecCopy = boardsDictionary.drafts.newSpec;
    const { model, effort } = board.config.specAuthoring;
    if (board.executor === null) {
        return (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
                {boardsDictionary.board.noExecutor}
            </p>
        );
    }
    return (
        <p className="text-muted-foreground text-xs">
            {board.executor === "fake"
                ? newSpecCopy.runsOnFake
                : fillMessage(newSpecCopy.runsOn, {
                      model,
                      effort: boardsDictionary.effort[effort],
                  })}
        </p>
    );
}

/**
 * Starts a spec draft: free text plus up to five files. Files go up one at a time before
 * the draft is created, so a refused file never leaves a half-made card behind.
 */
export function NewSpecDialog({
    board,
    open,
    boardsDictionary,
    onOpenChange,
    onCreated,
}: NewSpecDialogProps) {
    const { dictionary, locale } = getDictionary();
    const newSpecCopy = boardsDictionary.drafts.newSpec;
    const schema = useMemo(
        () => buildNewSpecFormSchema(dictionary),
        [dictionary]
    );
    const form = useForm<NewSpecFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { text: "" },
    });
    const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
    const [pickError, setPickError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { messageOf, uploadAttachmentMutation, createDraftMutation } =
        useSpecDraftCrud(board.id);
    const isBusy =
        form.formState.isSubmitting ||
        uploadAttachmentMutation.isPending ||
        createDraftMutation.isPending;
    const canSubmit = board.executor !== null && !isBusy;

    const reset = () => {
        form.reset({ text: "" });
        setAttachments([]);
        setPickError(null);
    };

    const updateAttachment = (key: string, patch: Partial<PickedAttachment>) =>
        setAttachments((current) =>
            current.map((item) =>
                item.key === key ? { ...item, ...patch } : item
            )
        );

    const pickFiles = (files: FileList | null) => {
        const picked = Array.from(files ?? []);
        if (picked.length === 0) {
            return;
        }
        if (attachments.length + picked.length > ATTACHMENTS_PER_DRAFT) {
            setPickError(
                fillMessage(newSpecCopy.tooMany, {
                    count: ATTACHMENTS_PER_DRAFT,
                })
            );
            return;
        }
        const refusal = picked
            .map((file) => attachmentFileError(file, dictionary))
            .find((message) => message !== null);
        if (refusal) {
            setPickError(refusal);
            return;
        }
        setPickError(null);
        setAttachments((current) => [
            ...current,
            ...picked.map((file) => ({
                key: nextKey(),
                file,
                status: "pending" as const,
                error: null,
                uploaded: null,
            })),
        ]);
    };

    const uploadAll = async (): Promise<UploadedAttachmentDTO[] | null> => {
        const uploaded: UploadedAttachmentDTO[] = [];
        for (const item of attachments) {
            if (item.uploaded) {
                uploaded.push(item.uploaded);
                continue;
            }
            updateAttachment(item.key, { status: "uploading", error: null });
            try {
                const result = await uploadAttachmentMutation.mutateAsync(
                    item.file
                );
                updateAttachment(item.key, {
                    status: "uploaded",
                    uploaded: result,
                });
                uploaded.push(result);
            } catch (error) {
                updateAttachment(item.key, {
                    status: "error",
                    error: messageOf(error),
                });
                return null;
            }
        }
        return uploaded;
    };

    const onSubmit = async (values: NewSpecFormValues) => {
        const uploaded = await uploadAll();
        if (uploaded === null) {
            return;
        }
        try {
            const result = await createDraftMutation.mutateAsync({
                text: values.text,
                attachments: uploaded.map(({ path, name }) => ({ path, name })),
            });
            reset();
            onCreated(result.card.slug);
        } catch {
            // The mutation already showed the error; the text and the files stay for a retry.
        }
    };

    return (
        <Dialog
            onOpenChange={(next) => {
                if (!(next || isBusy)) {
                    reset();
                }
                if (!isBusy) {
                    onOpenChange(next);
                }
            }}
            open={open}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{newSpecCopy.title}</DialogTitle>
                    <DialogDescription>
                        {newSpecCopy.description}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        className="flex flex-col gap-4"
                        noValidate
                        onSubmit={form.handleSubmit(onSubmit)}
                    >
                        <HookFormTextarea<NewSpecFormValues>
                            className="min-h-32"
                            label={newSpecCopy.textLabel}
                            name="text"
                            placeholder={newSpecCopy.textPlaceholder}
                        />
                        <section className="flex flex-col gap-2">
                            <h3 className="font-medium text-sm">
                                {newSpecCopy.attachments}
                            </h3>
                            {board.storageAvailable ? (
                                <>
                                    <DraftAttachmentList
                                        boardsDictionary={boardsDictionary}
                                        items={attachments.map((item) => ({
                                            key: item.key,
                                            name: item.file.name,
                                            size: item.file.size,
                                            contentType: item.file.type,
                                            status: item.status,
                                            error: item.error,
                                        }))}
                                        locale={locale}
                                        onRemove={(key) =>
                                            setAttachments((current) =>
                                                current.filter(
                                                    (item) => item.key !== key
                                                )
                                            )
                                        }
                                    />
                                    <input
                                        accept={ATTACHMENT_ACCEPT}
                                        aria-hidden
                                        className="sr-only"
                                        multiple
                                        onChange={(event) => {
                                            pickFiles(event.target.files);
                                            event.target.value = "";
                                        }}
                                        ref={fileInputRef}
                                        tabIndex={-1}
                                        type="file"
                                    />
                                    <Button
                                        className="w-fit"
                                        disabled={
                                            isBusy ||
                                            attachments.length >=
                                                ATTACHMENTS_PER_DRAFT
                                        }
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        type="button"
                                        variant="outline"
                                    >
                                        <PaperclipIcon aria-hidden />
                                        {newSpecCopy.attach}
                                    </Button>
                                    <p className="text-muted-foreground text-xs">
                                        {fillMessage(newSpecCopy.attachHint, {
                                            count: ATTACHMENTS_PER_DRAFT,
                                            size: ATTACHMENT_MAX_MB,
                                        })}
                                    </p>
                                    {pickError ? (
                                        <p
                                            className="text-destructive text-sm"
                                            role="alert"
                                        >
                                            {pickError}
                                        </p>
                                    ) : null}
                                </>
                            ) : (
                                <p className="text-muted-foreground text-sm">
                                    {newSpecCopy.attachmentsOff}
                                </p>
                            )}
                        </section>
                        <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground text-sm">
                            <li>{newSpecCopy.steps.read}</li>
                            <li>{newSpecCopy.steps.ask}</li>
                            <li>{newSpecCopy.steps.write}</li>
                        </ol>
                        <RunsOnLine
                            board={board}
                            boardsDictionary={boardsDictionary}
                        />
                        <DialogFooter>
                            <Button
                                disabled={isBusy}
                                onClick={() => {
                                    reset();
                                    onOpenChange(false);
                                }}
                                type="button"
                                variant="outline"
                            >
                                {newSpecCopy.cancel}
                            </Button>
                            <Button
                                disabled={!canSubmit}
                                loading={isBusy}
                                type="submit"
                            >
                                {isBusy
                                    ? newSpecCopy.submitting
                                    : newSpecCopy.submit}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
