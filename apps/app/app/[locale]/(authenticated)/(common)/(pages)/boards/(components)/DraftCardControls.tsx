"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import {
    Button,
    buttonVariants,
} from "@repo/design-system/components/ui/button";
import { canApproveSpec, draftStatus } from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import Link from "next/link";
import type { BoardsDictionary } from "./boardConfigIssueMessage";
import { draftOriginLine, draftStatusBadge } from "./draftCardStatus";

type DraftCardControlsProps = {
    card: CardDTO;
    href: string;
    canApprove: boolean;
    isApproving: boolean;
    boardsDictionary: BoardsDictionary;
    onApprove: (card: CardDTO) => void;
};

/** What a draft shows on the board: its writing status, where it came from and the next step. */
export function DraftCardControls({
    card,
    href,
    canApprove,
    isApproving,
    boardsDictionary,
    onApprove,
}: DraftCardControlsProps) {
    const cardCopy = boardsDictionary.drafts.card;
    const status = draftStatus(card);
    const badge = draftStatusBadge(status, boardsDictionary);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1">
                <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            <p className="text-muted-foreground text-xs">
                {draftOriginLine(
                    card.request?.attachments.length ?? 0,
                    boardsDictionary
                )}
            </p>
            {status === "waiting" ? (
                <Link
                    className={buttonVariants({
                        className: "w-fit",
                        size: "sm",
                        variant: "outline",
                    })}
                    href={href}
                >
                    {cardCopy.answer}
                </Link>
            ) : null}
            {status === "ready" ? (
                <div className="flex flex-wrap gap-2">
                    {canApprove && canApproveSpec(card) ? (
                        <Button
                            loading={isApproving}
                            onClick={() => onApprove(card)}
                            size="sm"
                            type="button"
                        >
                            {cardCopy.approve}
                        </Button>
                    ) : null}
                    <Link
                        className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                        })}
                        href={href}
                    >
                        {cardCopy.read}
                    </Link>
                </div>
            ) : null}
        </div>
    );
}
