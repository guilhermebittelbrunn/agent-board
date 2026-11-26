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
import type { RunnerDTO } from "@repo/sdk/src/types";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type RevokeRunnerDialogProps = {
    runner: RunnerDTO | null;
    isPending: boolean;
    boardsDictionary: BoardsDictionary;
    onConfirm: (runner: RunnerDTO) => void;
    onCancel: () => void;
};

export function RevokeRunnerDialog({
    runner,
    isPending,
    boardsDictionary,
    onConfirm,
    onCancel,
}: RevokeRunnerDialogProps) {
    const revokeCopy = boardsDictionary.credentials.revokeDialog;

    return (
        <Dialog
            onOpenChange={(open) => {
                if (!open) {
                    onCancel();
                }
            }}
            open={runner !== null}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {fillMessage(revokeCopy.title, {
                            name: runner?.name ?? "",
                        })}
                    </DialogTitle>
                    <DialogDescription>
                        {revokeCopy.description}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={onCancel} type="button" variant="outline">
                        {revokeCopy.cancel}
                    </Button>
                    <Button
                        loading={isPending}
                        onClick={() => {
                            if (runner) {
                                onConfirm(runner);
                            }
                        }}
                        type="button"
                        variant="destructive"
                    >
                        {revokeCopy.confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
