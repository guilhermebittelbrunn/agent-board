"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { RefreshCwIcon } from "lucide-react";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type BoardSyncButtonProps = {
    isPending: boolean;
    boardsDictionary: BoardsDictionary;
    onSync: () => void;
};

export function BoardSyncButton({
    isPending,
    boardsDictionary,
    onSync,
}: BoardSyncButtonProps) {
    const boardCopy = boardsDictionary.board;

    return (
        <Button
            disabled={isPending}
            onClick={onSync}
            type="button"
            variant="outline"
        >
            <RefreshCwIcon
                aria-hidden
                className={isPending ? "animate-spin" : undefined}
            />
            {isPending ? boardCopy.syncing : boardCopy.sync}
        </Button>
    );
}
