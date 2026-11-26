"use client";

import type { BoardViewDTO, CardDTO } from "@repo/sdk/src/types";
import { type ReactNode, useRef, useState } from "react";
import { useBoardCardCrud } from "../(hooks)/useBoardCardCrud";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import type { CardRunCommand } from "./CardRunControls";
import { restoreRunDialogFocus } from "./runDialogFocus";
import { StopRunDialog } from "./StopRunDialog";
import {
    type TriggerKind,
    type TriggerRequest,
    TriggerStageDialog,
} from "./TriggerStageDialog";

type UseStageRunDialogsInput = {
    boardId: string;
    board: BoardViewDTO | undefined;
    cards: readonly CardDTO[];
    boardsDictionary: BoardsDictionary;
    onAnnounce?: (message: string) => void;
};

/**
 * Every stage run starts and stops through a confirmation. The board and the card detail
 * share these dialogs, so a drag, "run again", "approve" and "stop" read the same anywhere.
 */
export function useStageRunDialogs({
    boardId,
    board,
    cards,
    boardsDictionary,
    onAnnounce,
}: UseStageRunDialogsInput): {
    requestTrigger: (
        card: CardDTO,
        stageKey: string,
        kind: TriggerKind
    ) => void;
    onCommand: (card: CardDTO, command: CardRunCommand) => void;
    dialogs: ReactNode;
} {
    const { triggerMutation, stopMutation } = useBoardCardCrud(boardId);
    const [triggerRequest, setTriggerRequest] = useState<TriggerRequest | null>(
        null
    );
    const [stopCard, setStopCard] = useState<CardDTO | null>(null);
    const cardCopy = boardsDictionary.board.card;
    const focusReturn = useRef<{ cardId: string; opener: Element | null }>(
        null
    );
    const rememberOpener = (card: CardDTO) => {
        focusReturn.current = {
            cardId: card.id,
            opener: document.activeElement,
        };
    };
    const onCloseAutoFocus = (event: Event) => {
        const target = focusReturn.current;
        if (target === null) {
            return;
        }
        event.preventDefault();
        focusReturn.current = null;
        requestAnimationFrame(() =>
            restoreRunDialogFocus(target.cardId, target.opener)
        );
    };

    const columnOf = (stageKey: string | null) =>
        board?.config.stages.find((stage) => stage.key === stageKey)?.column ??
        "";

    const requestTrigger = (
        card: CardDTO,
        stageKey: string,
        kind: TriggerKind
    ) => {
        rememberOpener(card);
        setTriggerRequest({ card, stageKey, kind });
    };

    const onCommand = (card: CardDTO, command: CardRunCommand) => {
        if (command === "stop") {
            rememberOpener(card);
            setStopCard(card);
            return;
        }
        if (card.stageKey !== null) {
            requestTrigger(card, card.stageKey, command);
        }
    };

    const confirmTrigger = (request: TriggerRequest) =>
        triggerMutation.mutate(
            { card: request.card, stageKey: request.stageKey },
            {
                onSuccess: (result) => {
                    setTriggerRequest(null);
                    onAnnounce?.(
                        fillMessage(
                            result.run.status === "queued"
                                ? cardCopy.queued
                                : cardCopy.triggered,
                            {
                                title: request.card.title,
                                column: columnOf(request.stageKey),
                            }
                        )
                    );
                },
                onError: () => setTriggerRequest(null),
            }
        );

    const confirmStop = (card: CardDTO) =>
        stopMutation.mutate(card, {
            onSettled: () => setStopCard(null),
            onSuccess: () =>
                onAnnounce?.(
                    fillMessage(cardCopy.stopped, { title: card.title })
                ),
        });

    const dialogs = board ? (
        <>
            <TriggerStageDialog
                board={board}
                boardsDictionary={boardsDictionary}
                cards={cards}
                isPending={triggerMutation.isPending}
                onCancel={() => setTriggerRequest(null)}
                onCloseAutoFocus={onCloseAutoFocus}
                onConfirm={confirmTrigger}
                request={triggerRequest}
            />
            <StopRunDialog
                boardsDictionary={boardsDictionary}
                card={stopCard}
                column={columnOf(stopCard?.stageKey ?? null)}
                isPending={stopMutation.isPending}
                onCancel={() => setStopCard(null)}
                onCloseAutoFocus={onCloseAutoFocus}
                onConfirm={confirmStop}
            />
        </>
    ) : null;

    return { requestTrigger, onCommand, dialogs };
}
