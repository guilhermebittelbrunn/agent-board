"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import type { ScheduledTaskTarget } from "../(hooks)/useBoardCredentialCrud";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type RemoveScheduledTaskDialogProps = {
    target: ScheduledTaskTarget | null;
    isPending: boolean;
    boardsDictionary: BoardsDictionary;
    onConfirm: (target: ScheduledTaskTarget) => void;
    onCancel: () => void;
};

export function RemoveScheduledTaskDialog({
    target,
    isPending,
    boardsDictionary,
    onConfirm,
    onCancel,
}: RemoveScheduledTaskDialogProps) {
    const removeCopy = boardsDictionary.credentials.cloud.removeDialog;

    return (
        <Dialog
            onOpenChange={(open) => {
                if (!(open || isPending)) {
                    onCancel();
                }
            }}
            open={target !== null}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {fillMessage(removeCopy.title, {
                            stage: target?.column ?? "",
                        })}
                    </DialogTitle>
                    <DialogDescription>
                        {removeCopy.description}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        disabled={isPending}
                        onClick={onCancel}
                        type="button"
                        variant="outline"
                    >
                        {removeCopy.cancel}
                    </Button>
                    <Button
                        loading={isPending}
                        onClick={() => {
                            if (target) {
                                onConfirm(target);
                            }
                        }}
                        type="button"
                        variant="destructive"
                    >
                        {isPending ? removeCopy.removing : removeCopy.confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
