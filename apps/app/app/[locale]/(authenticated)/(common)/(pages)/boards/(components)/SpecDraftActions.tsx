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
import { canApproveSpec, draftStatus } from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import { useState } from "react";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type DraftActionProps = {
    card: CardDTO;
    isPending: boolean;
    boardsDictionary: BoardsDictionary;
};

function approveHintOf(
    card: CardDTO,
    detailCopy: BoardsDictionary["drafts"]["detail"]
): string | null {
    switch (draftStatus(card)) {
        case "ready":
            return null;
        case "writing":
            return detailCopy.approveWritingHint;
        case "failed":
            return detailCopy.approveFailedHint;
        case "idle":
            return detailCopy.approveIdleHint;
        default:
            return detailCopy.approveHint;
    }
}

/** Approving only unlocks after a successful round with nothing left to answer. */
export function ApproveSpecButton({
    card,
    isPending,
    boardsDictionary,
    onApprove,
}: DraftActionProps & { onApprove: (card: CardDTO) => void }) {
    const detailCopy = boardsDictionary.drafts.detail;
    const hint = canApproveSpec(card) ? null : approveHintOf(card, detailCopy);
    return (
        <div className="flex flex-col gap-1.5">
            <Button
                disabled={hint !== null}
                loading={isPending}
                onClick={() => onApprove(card)}
                type="button"
            >
                {detailCopy.approve}
            </Button>
            {hint ? (
                <p className="text-muted-foreground text-xs">{hint}</p>
            ) : null}
        </div>
    );
}

/** The card leaves the board; the branch and what the agent pushed stay on GitHub. */
export function DiscardDraftButton({
    card,
    isPending,
    boardsDictionary,
    onDiscard,
}: DraftActionProps & { onDiscard: (card: CardDTO) => Promise<unknown> }) {
    const detailCopy = boardsDictionary.drafts.detail;
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                disabled={card.activeRunId !== null}
                onClick={() => setOpen(true)}
                type="button"
                variant="outline"
            >
                {detailCopy.discard}
            </Button>
            <Dialog onOpenChange={setOpen} open={open}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{detailCopy.discardTitle}</DialogTitle>
                        <DialogDescription>
                            {fillMessage(detailCopy.discardDescription, {
                                branch: card.branch ?? "",
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            onClick={() => setOpen(false)}
                            type="button"
                            variant="outline"
                        >
                            {detailCopy.discardCancel}
                        </Button>
                        <Button
                            loading={isPending}
                            onClick={async () => {
                                try {
                                    await onDiscard(card);
                                    setOpen(false);
                                } catch {
                                    // The mutation already showed the error; the dialog stays open.
                                }
                            }}
                            type="button"
                            variant="destructive"
                        >
                            {detailCopy.discardConfirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
