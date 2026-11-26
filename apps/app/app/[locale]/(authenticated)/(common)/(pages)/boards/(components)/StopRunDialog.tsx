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
import type { CardDTO } from "@repo/sdk/src/types";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type StopRunDialogProps = {
    card: CardDTO | null;
    column: string;
    isPending: boolean;
    boardsDictionary: BoardsDictionary;
    onConfirm: (card: CardDTO) => void;
    onCancel: () => void;
    onCloseAutoFocus?: (event: Event) => void;
};

export function StopRunDialog({
    card,
    column,
    isPending,
    boardsDictionary,
    onConfirm,
    onCancel,
    onCloseAutoFocus,
}: StopRunDialogProps) {
    const stopCopy = boardsDictionary.stop;

    return (
        <Dialog
            onOpenChange={(open) => {
                if (!open) {
                    onCancel();
                }
            }}
            open={card !== null}
        >
            <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>
                        {fillMessage(stopCopy.title, { column })}
                    </DialogTitle>
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
                        onClick={() => {
                            if (card) {
                                onConfirm(card);
                            }
                        }}
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
