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
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type StopCycleDialogProps = {
    open: boolean;
    isPending: boolean;
    boardsDictionary: BoardsDictionary;
    onConfirm: () => void;
    onCancel: () => void;
};

export function StopCycleDialog({
    open,
    isPending,
    boardsDictionary,
    onConfirm,
    onCancel,
}: StopCycleDialogProps) {
    const stopCopy = boardsDictionary.cycles.detail.stop;

    return (
        <Dialog
            onOpenChange={(next) => {
                if (!next) {
                    onCancel();
                }
            }}
            open={open}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{stopCopy.title}</DialogTitle>
                    <DialogDescription>
                        {stopCopy.description}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={onCancel} type="button" variant="outline">
                        {stopCopy.cancel}
                    </Button>
                    <Button
                        loading={isPending}
                        onClick={onConfirm}
                        type="button"
                        variant="destructive"
                    >
                        {stopCopy.confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
