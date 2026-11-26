"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { cardRunActions, displayCardState } from "@repo/kanban-contract";
import type { BoardViewDTO, CardDTO } from "@repo/sdk/src/types";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { CardStateBadge } from "./CardStateBadge";
import { cardRunReason } from "./cardRunReason";

export type CardRunCommand = "rerun" | "approve" | "stop";

type CardRunControlsProps = {
    card: CardDTO;
    board: Pick<BoardViewDTO, "config" | "executor">;
    /** The person can trigger stages on this board and is not impersonating. */
    canTrigger: boolean;
    boardsDictionary: BoardsDictionary;
    onCommand: (card: CardDTO, command: CardRunCommand) => void;
    /** The card detail already shows the orphan badge next to the column. */
    showOrphan?: boolean;
};

/** State, rework loop, why the card stopped and the run buttons, on the board and the card. */
export function CardRunControls({
    card,
    board,
    canTrigger,
    boardsDictionary,
    onCommand,
    showOrphan = true,
}: CardRunControlsProps) {
    const cardCopy = boardsDictionary.board.card;
    const actionsCopy = cardCopy.runActions;
    const actions = cardRunActions(card, {
        canTrigger,
        executorAvailable: board.executor !== null,
    });
    const reason = cardRunReason(card, board.config, boardsDictionary);
    const buttons = [
        actions.approve
            ? {
                  command: "approve" as const,
                  label: actionsCopy.approve,
                  aria: actionsCopy.approveAria,
                  variant: "default" as const,
              }
            : null,
        actions.rerun
            ? {
                  command: "rerun" as const,
                  label: actionsCopy.rerun,
                  aria: actionsCopy.rerunAria,
                  variant: "outline" as const,
              }
            : null,
        actions.stop
            ? {
                  command: "stop" as const,
                  label: actionsCopy.stop,
                  aria: actionsCopy.stopAria,
                  variant: "outline" as const,
              }
            : null,
    ].filter((button) => button !== null);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1">
                <CardStateBadge
                    boardsDictionary={boardsDictionary}
                    state={displayCardState(card)}
                />
                {card.lane === "stage" && card.reworkLoops > 0 ? (
                    <Badge variant="outline">
                        {fillMessage(cardCopy.reworkLoop, {
                            loop: card.reworkLoops,
                            max: board.config.limits.maxReworkLoops,
                        })}
                    </Badge>
                ) : null}
                {showOrphan && card.orphan ? (
                    <Badge variant="outline">{cardCopy.orphan}</Badge>
                ) : null}
            </div>
            {reason ? (
                <p className="text-muted-foreground text-xs">{reason}</p>
            ) : null}
            {buttons.length > 0 ? (
                <div
                    className="flex flex-wrap gap-2"
                    data-run-controls={card.id}
                >
                    {buttons.map((button) => (
                        <Button
                            aria-label={fillMessage(button.aria, {
                                title: card.title,
                            })}
                            key={button.command}
                            onClick={() => onCommand(card, button.command)}
                            size="sm"
                            type="button"
                            variant={button.variant}
                        >
                            {button.label}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
