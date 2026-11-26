"use client";

import {
    type ActionMenuItem,
    ActionsMenu,
} from "@repo/design-system/components/ui";
import type { CardDTO } from "@repo/sdk/src/types";
import {
    ArrowDownIcon,
    ArrowRightIcon,
    ArrowUpIcon,
    ArrowUpToLineIcon,
} from "lucide-react";
import { boardColumnTitle } from "./boardColumnTitle";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import {
    type BoardScreenColumn,
    type ColumnTarget,
    isCardInColumn,
    moveTargetOf,
} from "./groupCardsByColumn";

export type MoveDestination = {
    column: BoardScreenColumn;
    target: ColumnTarget;
};

type CardMoveMenuProps = {
    card: CardDTO;
    columns: BoardScreenColumn[];
    /** Position of the card in Tasks (0 on top) and the queue size; only for Tasks cards. */
    queue: { index: number; size: number } | null;
    /** Stage columns are offered only when the person can trigger a stage here. */
    canTrigger: boolean;
    boardsDictionary: BoardsDictionary;
    onMove: (destination: MoveDestination) => void;
    onReorder: (index: number) => void;
};

const ICON_CLASS = "size-4";

/** The keyboard and touch path for everything dragging does. */
export function CardMoveMenu({
    card,
    columns,
    queue,
    canTrigger,
    boardsDictionary,
    onMove,
    onReorder,
}: CardMoveMenuProps) {
    const cardCopy = boardsDictionary.board.card;
    const items: ActionMenuItem[] = [];

    if (queue && queue.index > 0) {
        items.push(
            {
                icon: <ArrowUpToLineIcon aria-hidden className={ICON_CLASS} />,
                key: "move-top",
                label: cardCopy.moveTop,
                onClick: () => onReorder(0),
            },
            {
                icon: <ArrowUpIcon aria-hidden className={ICON_CLASS} />,
                key: "move-up",
                label: cardCopy.moveUp,
                onClick: () => onReorder(queue.index - 1),
            }
        );
    }
    if (queue && queue.index < queue.size - 1) {
        items.push({
            icon: <ArrowDownIcon aria-hidden className={ICON_CLASS} />,
            key: "move-down",
            label: cardCopy.moveDown,
            onClick: () => onReorder(queue.index + 1),
        });
    }

    for (const column of columns) {
        const target = moveTargetOf(column);
        if (
            !target ||
            isCardInColumn(card, column) ||
            (target.lane === "stage" && !canTrigger)
        ) {
            continue;
        }
        items.push({
            icon: <ArrowRightIcon aria-hidden className={ICON_CLASS} />,
            key: `move-to-${column.id}`,
            label: fillMessage(cardCopy.moveTo, {
                column: boardColumnTitle(column, boardsDictionary),
            }),
            onClick: () => onMove({ column, target }),
        });
    }

    if (items.length === 0) {
        return null;
    }
    return (
        <ActionsMenu
            className="size-8 p-1 [&_svg]:size-4"
            items={items}
            triggerLabel={fillMessage(cardCopy.actions, { title: card.title })}
        />
    );
}
