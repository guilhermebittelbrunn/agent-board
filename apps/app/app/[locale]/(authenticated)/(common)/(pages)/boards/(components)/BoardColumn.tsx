"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { PlusIcon } from "lucide-react";
import { type DragEvent, type ReactNode, useId } from "react";
import { boardColumnTitle } from "./boardColumnTitle";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { type BoardScreenColumn, isRemovedStage } from "./groupCardsByColumn";

type BoardColumnProps = {
    column: BoardScreenColumn;
    count: number;
    emptyHint: string;
    isDropTarget: boolean;
    boardsDictionary: BoardsDictionary;
    children: ReactNode;
    /** Shown on the Drafts column to whoever can start a spec draft. */
    onAdd?: () => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: () => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
};

function ColumnSubtitle({
    column,
    boardsDictionary,
}: {
    column: BoardScreenColumn;
    boardsDictionary: BoardsDictionary;
}) {
    const columnsCopy = boardsDictionary.board.columns;
    if (isRemovedStage(column)) {
        return (
            <span className="font-mono text-muted-foreground text-xs">
                {column.stageKey}
            </span>
        );
    }
    if (column.lane === "stage") {
        return (
            <span className="font-mono text-muted-foreground text-xs">
                {column.command} · {column.model} ·{" "}
                {boardsDictionary.effort[
                    column.effort as keyof BoardsDictionary["effort"]
                ] ?? column.effort}
            </span>
        );
    }
    const hintOf = {
        drafts: columnsCopy.draftsHint,
        tasks: columnsCopy.tasksHint,
        done: columnsCopy.doneHint,
    } as const;
    return (
        <span className="text-muted-foreground text-xs">
            {hintOf[column.lane]}
        </span>
    );
}

export function BoardColumn({
    column,
    count,
    emptyHint,
    isDropTarget,
    boardsDictionary,
    children,
    onAdd,
    onDragOver,
    onDragLeave,
    onDrop,
}: BoardColumnProps) {
    const titleId = useId();
    const title = boardColumnTitle(column, boardsDictionary);
    const ListTag = column.lane === "tasks" ? "ol" : "ul";

    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the column is only a drop zone for mouse dragging; the card menu moves cards by keyboard
        <section
            aria-labelledby={titleId}
            className={cn(
                "flex min-w-0 flex-col gap-3 rounded-xl p-1 md:w-72 md:shrink-0",
                isDropTarget && "bg-accent ring-2 ring-primary"
            )}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            <header className="relative flex flex-col gap-0.5 border-border border-b px-1 pb-2">
                {onAdd ? (
                    <Button
                        aria-label={boardsDictionary.board.columns.addDraft}
                        className="absolute top-0 right-0 size-7"
                        onClick={onAdd}
                        size="icon"
                        type="button"
                        variant="ghost"
                    >
                        <PlusIcon aria-hidden className="size-4" />
                    </Button>
                ) : null}
                <h2
                    className="flex items-baseline gap-2 font-semibold text-sm"
                    id={titleId}
                >
                    {title}
                    <span
                        aria-hidden
                        className="font-normal text-muted-foreground text-xs"
                    >
                        {count}
                    </span>
                    <span className="sr-only">
                        {count === 1
                            ? boardsDictionary.board.columns.countOne
                            : fillMessage(
                                  boardsDictionary.board.columns.countOther,
                                  { count }
                              )}
                    </span>
                </h2>
                <ColumnSubtitle
                    boardsDictionary={boardsDictionary}
                    column={column}
                />
            </header>
            {count === 0 ? (
                <div className="flex min-h-28 items-center justify-center rounded-xl border border-border border-dashed p-4 text-center text-muted-foreground text-sm">
                    {emptyHint}
                </div>
            ) : (
                <ListTag className="flex flex-col gap-2">{children}</ListTag>
            )}
        </section>
    );
}
