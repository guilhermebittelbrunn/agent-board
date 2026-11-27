import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import { SPEC_STAGE_KEY } from "@repo/kanban-contract";
import type {
    BoardViewDTO,
    CardDTO,
    MoveCardRequest,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { fillMessage } from "../(components)/boardConfigIssueMessage";

export type MoveCardInput = { card: CardDTO; target: MoveCardRequest };
export type TriggerCardInput = { card: CardDTO; stageKey: string };

type Snapshot = { previous: CardDTO[] | undefined };

const nextTasksOrder = (cards: CardDTO[]) =>
    cards.reduce((max, card) => Math.max(max, card.order), -1) + 1;

const placeCard = (
    cards: CardDTO[],
    { card, target }: MoveCardInput
): CardDTO[] =>
    cards.map((current) =>
        current.id === card.id
            ? {
                  ...current,
                  lane: target.lane,
                  stageKey: null,
                  state: "idle" as const,
                  order:
                      target.lane === "tasks" && current.lane !== "tasks"
                          ? nextTasksOrder(cards)
                          : current.order,
              }
            : current
    );

const reorderCards = (cards: CardDTO[], slugs: string[]): CardDTO[] => {
    const positions = new Map(slugs.map((slug, index) => [slug, index]));
    return cards.map((card) => {
        const order = positions.get(card.slug);
        return order === undefined ? card : { ...card, order };
    });
};

/**
 * Reorder and move update the board at once and put it back when the API refuses. The
 * list is then read again, since a refusal like CARD_ORDER_STALE means the server holds
 * a board the screen has not seen.
 */
export const useBoardCardCrud = (boardId: string) => {
    const { successAlert, errorAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();
    const boardCopy = dictionary.apps.app.pages.common.boards.board;
    const cardsKey = queryKeys.boards.cards(boardId);

    const showError = (error: unknown) =>
        errorAlert(handleClientError(new FormattedError(error, locale)));

    const applyOptimistic = async (
        update: (cards: CardDTO[]) => CardDTO[]
    ): Promise<Snapshot> => {
        await queryClient.cancelQueries({ queryKey: cardsKey });
        const previous = queryClient.getQueryData<CardDTO[]>(cardsKey);
        if (previous) {
            queryClient.setQueryData<CardDTO[]>(cardsKey, update(previous));
        }
        return { previous };
    };

    const rollback = async (error: unknown, snapshot: Snapshot | undefined) => {
        if (snapshot?.previous) {
            queryClient.setQueryData(cardsKey, snapshot.previous);
        }
        showError(error);
        await queryClient.invalidateQueries({ queryKey: cardsKey });
    };

    const syncMutation = useMutation({
        mutationFn: () => apiClient.boardCard.sync(boardId),
        onSuccess: async (result) => {
            queryClient.setQueryData(cardsKey, result.cards);
            queryClient.setQueryData<BoardViewDTO>(
                queryKeys.boards.detail(boardId),
                (board) =>
                    board
                        ? { ...board, backlogSync: result.backlogSync }
                        : board
            );
            successAlert(
                fillMessage(boardCopy.syncSummary, {
                    created: result.created,
                    updated: result.updated,
                    orphaned: result.orphaned,
                })
            );
            await queryClient.invalidateQueries({
                queryKey: queryKeys.boards.detail(boardId),
            });
        },
        onError: showError,
    });

    const reorderMutation = useMutation({
        mutationFn: (slugs: string[]) =>
            apiClient.boardCard.reorder(boardId, { slugs }),
        onMutate: (slugs) =>
            applyOptimistic((cards) => reorderCards(cards, slugs)),
        onSuccess: (cards) => {
            queryClient.setQueryData(cardsKey, cards);
        },
        onError: (error, _slugs, snapshot) => rollback(error, snapshot),
    });

    const moveMutation = useMutation({
        mutationFn: ({ card, target }: MoveCardInput) =>
            apiClient.boardCard.move(boardId, card.slug, target),
        onMutate: (input) =>
            applyOptimistic((cards) => placeCard(cards, input)),
        onSuccess: (moved) => {
            queryClient.setQueryData<CardDTO[]>(cardsKey, (cards) =>
                cards?.map((card) => (card.id === moved.id ? moved : card))
            );
            queryClient.setQueryData(
                queryKeys.boards.card(boardId, moved.slug),
                moved
            );
        },
        onError: (error, _input, snapshot) => rollback(error, snapshot),
    });

    const storeCard = (card: CardDTO) => {
        queryClient.setQueryData<CardDTO[]>(cardsKey, (cards) =>
            cards?.map((current) => (current.id === card.id ? card : current))
        );
        queryClient.setQueryData(
            queryKeys.boards.card(boardId, card.slug),
            card
        );
    };

    // A run writes on the timeline as it goes, so the card's events are read again.
    const refreshEvents = (card: CardDTO) =>
        queryClient.invalidateQueries({
            queryKey: queryKeys.boards.cardEvents(boardId, card.slug),
        });

    const triggerMutation = useMutation({
        mutationFn: ({ card, stageKey }: TriggerCardInput) =>
            apiClient.boardCard.trigger(boardId, card.slug, { stageKey }),
        onMutate: ({ card, stageKey }) =>
            applyOptimistic((cards) =>
                cards.map((current) =>
                    current.id === card.id
                        ? {
                              ...current,
                              lane:
                                  stageKey === SPEC_STAGE_KEY
                                      ? ("drafts" as const)
                                      : ("stage" as const),
                              stageKey,
                              state: "queued" as const,
                          }
                        : current
                )
            ),
        onSuccess: async (result) => {
            storeCard(result.card);
            await refreshEvents(result.card);
        },
        onError: (error, _input, snapshot) => rollback(error, snapshot),
    });

    const stopMutation = useMutation({
        mutationFn: (card: CardDTO) =>
            apiClient.boardCard.stop(boardId, card.slug),
        onSuccess: async (card) => {
            storeCard(card);
            await refreshEvents(card);
        },
        onError: async (error) => {
            showError(error);
            await queryClient.invalidateQueries({ queryKey: cardsKey });
        },
    });

    return {
        syncMutation,
        reorderMutation,
        moveMutation,
        triggerMutation,
        stopMutation,
    };
};
