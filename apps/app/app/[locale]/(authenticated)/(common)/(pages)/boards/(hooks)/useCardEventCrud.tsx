import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import type {
    AnswerQuestionsRequest,
    BoardViewDTO,
    CardCommentRequest,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { fillMessage } from "../(components)/boardConfigIssueMessage";
import { stageColumnName } from "../(components)/stageColumnName";

export type EditCommentInput = { eventId: string; markdown: string };

/**
 * Comments and answers re-read the timeline after they land. A refused answer re-reads the
 * card too: CARD_QUESTIONS_NOT_PENDING means someone answered first or the agent asked
 * again, and the screen has to show that.
 */
export const useCardEventCrud = (boardId: string, slug: string) => {
    const { successAlert, errorAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();
    const detailCopy = dictionary.apps.app.pages.common.boards.cardDetail;
    const eventsKey = queryKeys.boards.cardEvents(boardId, slug);
    const cardKey = queryKeys.boards.card(boardId, slug);

    const showError = (error: unknown) =>
        errorAlert(handleClientError(new FormattedError(error, locale)));
    const refreshEvents = () =>
        queryClient.invalidateQueries({ queryKey: eventsKey });

    const commentMutation = useMutation({
        mutationFn: (body: CardCommentRequest) =>
            apiClient.boardCard.comment(boardId, slug, body),
        onSuccess: async () => {
            successAlert(detailCopy.timeline.commentSent);
            await refreshEvents();
        },
        onError: showError,
    });

    const editCommentMutation = useMutation({
        mutationFn: ({ eventId, markdown }: EditCommentInput) =>
            apiClient.boardCard.editComment(boardId, slug, eventId, {
                markdown,
            }),
        onSuccess: async () => {
            successAlert(detailCopy.timeline.commentEdited);
            await refreshEvents();
        },
        onError: async (error) => {
            showError(error);
            await refreshEvents();
        },
    });

    const deleteCommentMutation = useMutation({
        mutationFn: (eventId: string) =>
            apiClient.boardCard.deleteComment(boardId, slug, eventId),
        onSuccess: async () => {
            successAlert(detailCopy.timeline.commentDeleted);
            await refreshEvents();
        },
        onError: async (error) => {
            showError(error);
            await refreshEvents();
        },
    });

    const answerMutation = useMutation({
        mutationFn: (body: AnswerQuestionsRequest) =>
            apiClient.boardCard.answer(boardId, slug, body),
        onSuccess: async (result) => {
            queryClient.setQueryData(cardKey, result.card);
            const board = queryClient.getQueryData<BoardViewDTO>(
                queryKeys.boards.detail(boardId)
            );
            const column = board
                ? stageColumnName(
                      board.config,
                      result.card.stageKey,
                      dictionary.apps.app.pages.common.boards
                  )
                : null;
            successAlert(
                result.card.activeRunId !== null && column
                    ? fillMessage(detailCopy.questions.resumed, { column })
                    : detailCopy.questions.sent
            );
            await Promise.all([
                refreshEvents(),
                queryClient.invalidateQueries({
                    queryKey: queryKeys.boards.cards(boardId),
                    exact: true,
                }),
            ]);
        },
        onError: async (error) => {
            showError(error);
            await Promise.all([
                refreshEvents(),
                queryClient.invalidateQueries({ queryKey: cardKey }),
            ]);
        },
    });

    return {
        commentMutation,
        editCommentMutation,
        deleteCommentMutation,
        answerMutation,
    };
};
