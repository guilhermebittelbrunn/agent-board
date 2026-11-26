"use client";

import type { BoardViewDTO } from "@repo/sdk/src/types";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type BoardSummaryLineProps = {
    board: BoardViewDTO;
    boardsDictionary: BoardsDictionary;
    runs?: { running: number; queued: number };
};

/** Repository, base branch and when the backlog was last read, under the board title. */
export function BoardSummaryLine({
    board,
    boardsDictionary,
    runs,
}: BoardSummaryLineProps) {
    const formatDateTime = useFormatDisplayDateTime();
    const boardCopy = boardsDictionary.board;

    return (
        <>
            {board.repository.fullName} · {boardCopy.base}{" "}
            <span className="font-mono">{board.config.baseBranch}</span> ·{" "}
            {board.backlogSync
                ? fillMessage(boardCopy.syncedAt, {
                      date: formatDateTime(board.backlogSync.syncedAt),
                  })
                : boardCopy.neverSynced}
            {runs && runs.running + runs.queued > 0
                ? ` · ${fillMessage(boardCopy.summaryRuns, runs)}`
                : null}
        </>
    );
}
