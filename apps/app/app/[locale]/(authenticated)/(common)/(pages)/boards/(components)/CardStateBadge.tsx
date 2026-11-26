import { Badge } from "@repo/design-system/components/ui/badge";
import type { CardState } from "@repo/kanban-contract";
import type { ComponentProps } from "react";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type CardStateBadgeProps = {
    state: CardState;
    boardsDictionary: BoardsDictionary;
};

const VARIANT_OF: Record<CardState, ComponentProps<typeof Badge>["variant"]> = {
    idle: "secondary",
    queued: "secondary",
    running: "secondary",
    waiting_input: "outline",
    failed: "destructive",
};

export function CardStateBadge({
    state,
    boardsDictionary,
}: CardStateBadgeProps) {
    return (
        <Badge variant={VARIANT_OF[state]}>
            {boardsDictionary.board.card.states[state]}
        </Badge>
    );
}
