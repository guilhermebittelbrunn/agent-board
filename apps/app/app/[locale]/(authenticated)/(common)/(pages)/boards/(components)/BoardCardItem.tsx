"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { displayCardState } from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import Link from "next/link";
import type { DragEvent, ReactNode } from "react";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { CardStateBadge } from "./CardStateBadge";

type BoardCardItemProps = {
    card: CardDTO;
    href: string;
    /** 1-based position, shown only for cards in Tasks. */
    position: number | null;
    draggable: boolean;
    isDragging: boolean;
    boardsDictionary: BoardsDictionary;
    menu: ReactNode;
    /** State, reason and run buttons; replaces the bare state badge when given. */
    runControls?: ReactNode;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onDragOver?: (event: DragEvent<HTMLElement>) => void;
    onDrop?: (event: DragEvent<HTMLElement>) => void;
};

export function BoardCardItem({
    card,
    href,
    position,
    draggable,
    isDragging,
    boardsDictionary,
    menu,
    runControls,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
}: BoardCardItemProps) {
    const cardCopy = boardsDictionary.board.card;
    const shownState = displayCardState(card);

    return (
        <Card
            className={cn(
                "gap-2 p-3",
                draggable && "cursor-grab active:cursor-grabbing",
                isDragging && "opacity-50",
                shownState === "failed" && "border-destructive",
                shownState === "waiting_input" && "border-primary"
            )}
            draggable={draggable}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragStart={onDragStart}
            onDrop={onDrop}
        >
            <div className="flex items-start gap-2">
                {position === null ? null : (
                    <span
                        className="pt-0.5 font-mono text-muted-foreground text-xs"
                        title={fillMessage(cardCopy.position, { position })}
                    >
                        {position}
                    </span>
                )}
                <Link
                    className="min-w-0 flex-1 break-words font-medium text-sm hover:underline focus-visible:underline focus-visible:outline-none"
                    data-card-link={card.id}
                    draggable={false}
                    href={href}
                >
                    {card.title}
                </Link>
                {menu}
            </div>
            {position === null &&
            !runControls &&
            (card.lane !== "done" || card.orphan) ? (
                <div className="flex flex-wrap items-center gap-1">
                    {card.lane === "done" ? null : (
                        <CardStateBadge
                            boardsDictionary={boardsDictionary}
                            state={shownState}
                        />
                    )}
                    {card.orphan ? (
                        <Badge variant="outline">{cardCopy.orphan}</Badge>
                    ) : null}
                </div>
            ) : null}
            {position === null ? runControls : null}
            {position === null && card.branch ? (
                <span className="break-all font-mono text-muted-foreground text-xs">
                    {card.branch}
                </span>
            ) : null}
        </Card>
    );
}
