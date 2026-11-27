import type { BoardsDictionary } from "./boardConfigIssueMessage";
import { type BoardScreenColumn, isRemovedStage } from "./groupCardsByColumn";

export function boardColumnTitle(
    column: BoardScreenColumn,
    boardsDictionary: BoardsDictionary
): string {
    const columnsCopy = boardsDictionary.board.columns;
    if (isRemovedStage(column)) {
        return columnsCopy.removedStage;
    }
    if (column.lane === "drafts") {
        return columnsCopy.drafts;
    }
    if (column.lane === "tasks") {
        return columnsCopy.tasks;
    }
    if (column.lane === "done") {
        return columnsCopy.done;
    }
    return column.title;
}
