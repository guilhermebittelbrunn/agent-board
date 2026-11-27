import type { Badge } from "@repo/design-system/components/ui/badge";
import type { SpecDraftStatus } from "@repo/kanban-contract";
import type { ComponentProps } from "react";
import type { BoardsDictionary } from "./boardConfigIssueMessage";
import { fillMessage } from "./boardConfigIssueMessage";

const VARIANT_OF: Record<
    SpecDraftStatus,
    ComponentProps<typeof Badge>["variant"]
> = {
    writing: "secondary",
    waiting: "outline",
    ready: "default",
    failed: "destructive",
    idle: "secondary",
};

export function draftStatusBadge(
    status: SpecDraftStatus,
    boardsDictionary: BoardsDictionary
) {
    return {
        label: boardsDictionary.drafts.status[status],
        variant: VARIANT_OF[status],
    };
}

export function draftOriginLine(
    attachmentCount: number,
    boardsDictionary: BoardsDictionary
): string {
    const cardCopy = boardsDictionary.drafts.card;
    if (attachmentCount === 0) {
        return cardCopy.origin;
    }
    return attachmentCount === 1
        ? cardCopy.originWithOneAttachment
        : fillMessage(cardCopy.originWithAttachments, {
              count: attachmentCount,
          });
}
