"use client";

import type { CardDTO } from "@repo/sdk/src/types";
import {
    type DragEvent,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";
import { BoardCardItem } from "./BoardCardItem";
import { BoardColumn } from "./BoardColumn";
import type { BoardsDictionary } from "./boardConfigIssueMessage";
import { CardMoveMenu, type MoveDestination } from "./CardMoveMenu";
import {
    type BoardScreenColumn,
    type GroupedColumn,
    isCardInColumn,
    moveTargetOf,
    reorderedSlugs,
} from "./groupCardsByColumn";

type BoardColumnsProps = {
    columns: GroupedColumn[];
    canPrioritize: boolean;
    /** Can trigger and an executor exists: stage columns take drops. */
    canTrigger: boolean;
    boardsDictionary: BoardsDictionary;
    cardHref: (slug: string) => string;
    /** Run state, reason and buttons drawn under each card. */
    renderRunControls?: (card: CardDTO) => ReactNode;
    onMove: (card: CardDTO, destination: MoveDestination) => void;
    onReorder: (card: CardDTO, slugs: string[], index: number) => void;
    /** Opens the new spec dialog from the Drafts column; absent for who cannot start one. */
    onNewDraft?: () => void;
};

const DRAG_TYPE = "text/plain";

/** Where the card moved by its menu should be once the board shows the move. */
type FocusTarget = { cardId: string; columnId: string; index: number | null };

function emptyHintOf(
    column: BoardScreenColumn,
    isFirstStage: boolean,
    canPrioritize: boolean,
    boardsDictionary: BoardsDictionary
): string {
    const emptyCopy = boardsDictionary.board.columns.empty;
    if (column.lane === "drafts") {
        return emptyCopy.drafts;
    }
    if (column.lane === "tasks") {
        return emptyCopy.tasks;
    }
    return isFirstStage && canPrioritize
        ? emptyCopy.firstStage
        : emptyCopy.other;
}

type ColumnCardProps = {
    card: CardDTO;
    index: number;
    grouped: GroupedColumn;
    screenColumns: BoardScreenColumn[];
    canPrioritize: boolean;
    canTrigger: boolean;
    isDragging: boolean;
    boardsDictionary: BoardsDictionary;
    href: string;
    canDrop: boolean;
    runControls: ReactNode;
    onDragStart: () => void;
    onDragEnd: () => void;
    onDropOnCard: () => void;
    onMove: (destination: MoveDestination) => void;
    onReorder: (index: number) => void;
};

function ColumnCard({
    card,
    index,
    grouped,
    screenColumns,
    canPrioritize,
    canTrigger,
    isDragging,
    boardsDictionary,
    href,
    canDrop,
    runControls,
    onDragStart,
    onDragEnd,
    onDropOnCard,
    onMove,
    onReorder,
}: ColumnCardProps) {
    const isTasks = grouped.column.lane === "tasks";
    const isRunning = card.activeRunId !== null;
    const canMove = canPrioritize && !isRunning && card.lane !== "drafts";
    const menu = canMove ? (
        <span className="contents" data-card-menu={card.id}>
            <CardMoveMenu
                boardsDictionary={boardsDictionary}
                canTrigger={canTrigger}
                card={card}
                columns={screenColumns}
                onMove={onMove}
                onReorder={onReorder}
                queue={isTasks ? { index, size: grouped.cards.length } : null}
            />
        </span>
    ) : null;

    return (
        <li>
            <BoardCardItem
                boardsDictionary={boardsDictionary}
                card={card}
                draggable={canMove}
                href={href}
                isDragging={isDragging}
                menu={menu}
                onDragEnd={onDragEnd}
                onDragOver={
                    isTasks
                        ? (event: DragEvent<HTMLElement>) => {
                              if (canDrop) {
                                  event.preventDefault();
                              }
                          }
                        : undefined
                }
                onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(DRAG_TYPE, card.slug);
                    onDragStart();
                }}
                onDrop={
                    isTasks
                        ? (event: DragEvent<HTMLElement>) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onDropOnCard();
                          }
                        : undefined
                }
                position={isTasks ? index + 1 : null}
                runControls={runControls}
            />
        </li>
    );
}

/**
 * The columns of the board. The mouse drags with the browser's native drag and drop; the
 * "⋯" menu of each card does the same by keyboard and on touch screens, where native
 * dragging does not fire.
 */
export function BoardColumns({
    columns,
    canPrioritize,
    canTrigger,
    boardsDictionary,
    cardHref,
    renderRunControls,
    onMove,
    onReorder,
    onNewDraft,
}: BoardColumnsProps) {
    const [dragging, setDragging] = useState<CardDTO | null>(null);
    const [dropColumnId, setDropColumnId] = useState<string | null>(null);
    const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const screenColumns = columns.map(({ column }) => column);
    const tasksQueue =
        columns.find(({ column }) => column.lane === "tasks")?.cards ?? [];
    const firstStageId = screenColumns.find(
        (column) => column.lane === "stage"
    )?.id;

    // The moved card is unmounted and mounted again in its new list, which drops the
    // keyboard focus on the body; it goes back to the card's menu once the card is there.
    useEffect(() => {
        if (!focusTarget) {
            return;
        }
        const position =
            columns
                .find(({ column }) => column.id === focusTarget.columnId)
                ?.cards.findIndex((item) => item.id === focusTarget.cardId) ??
            -1;
        if (
            position === -1 ||
            (focusTarget.index !== null && position !== focusTarget.index)
        ) {
            return;
        }
        setFocusTarget(null);
        const menu = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>(
                "[data-card-menu]"
            ) ?? []
        ).find((element) => element.dataset.cardMenu === focusTarget.cardId);
        menu?.querySelector<HTMLElement>("button")?.focus();
    }, [focusTarget, columns]);

    const endDrag = () => {
        setDragging(null);
        setDropColumnId(null);
    };

    const reorderTo = (card: CardDTO, index: number): boolean => {
        const slugs = reorderedSlugs(tasksQueue, card.slug, index);
        if (slugs) {
            onReorder(card, slugs, index);
        }
        return slugs !== null;
    };

    const dropOn = (grouped: GroupedColumn, index: number | null) => {
        const card = dragging;
        endDrag();
        if (!card) {
            return;
        }
        const { column } = grouped;
        if (column.lane === "tasks" && card.lane === "tasks") {
            reorderTo(card, index ?? tasksQueue.length - 1);
            return;
        }
        const target = moveTargetOf(column);
        if (
            target &&
            !isCardInColumn(card, column) &&
            (target.lane !== "stage" || canTrigger)
        ) {
            onMove(card, { column, target });
        }
    };

    const canDropOn = (grouped: GroupedColumn) =>
        dragging !== null &&
        moveTargetOf(grouped.column) !== null &&
        (grouped.column.lane !== "stage" || canTrigger) &&
        (grouped.column.lane === "tasks" ||
            !isCardInColumn(dragging, grouped.column));

    return (
        <div
            className="flex flex-col gap-6 md:flex-row md:items-start md:overflow-x-auto md:pb-2"
            ref={containerRef}
        >
            {columns.map((grouped) => {
                const { column, cards } = grouped;
                return (
                    <BoardColumn
                        boardsDictionary={boardsDictionary}
                        column={column}
                        count={cards.length}
                        emptyHint={emptyHintOf(
                            column,
                            column.id === firstStageId,
                            canPrioritize,
                            boardsDictionary
                        )}
                        isDropTarget={dropColumnId === column.id}
                        key={column.id}
                        onAdd={
                            column.lane === "drafts" ? onNewDraft : undefined
                        }
                        onDragLeave={() =>
                            setDropColumnId((current) =>
                                current === column.id ? null : current
                            )
                        }
                        onDragOver={(event) => {
                            if (!canDropOn(grouped)) {
                                return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDropColumnId(column.id);
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            dropOn(grouped, null);
                        }}
                    >
                        {cards.map((card, index) => (
                            <ColumnCard
                                boardsDictionary={boardsDictionary}
                                canDrop={canDropOn(grouped)}
                                canPrioritize={canPrioritize}
                                canTrigger={canTrigger}
                                card={card}
                                grouped={grouped}
                                href={cardHref(card.slug)}
                                index={index}
                                isDragging={dragging?.id === card.id}
                                key={card.id}
                                onDragEnd={endDrag}
                                onDragStart={() => {
                                    setFocusTarget(null);
                                    setDragging(card);
                                }}
                                onDropOnCard={() => dropOn(grouped, index)}
                                onMove={(destination) => {
                                    setFocusTarget({
                                        cardId: card.id,
                                        columnId: destination.column.id,
                                        index: null,
                                    });
                                    onMove(card, destination);
                                }}
                                onReorder={(target) => {
                                    if (reorderTo(card, target)) {
                                        setFocusTarget({
                                            cardId: card.id,
                                            columnId: column.id,
                                            index: target,
                                        });
                                    }
                                }}
                                runControls={renderRunControls?.(card)}
                                screenColumns={screenColumns}
                            />
                        ))}
                    </BoardColumn>
                );
            })}
        </div>
    );
}
