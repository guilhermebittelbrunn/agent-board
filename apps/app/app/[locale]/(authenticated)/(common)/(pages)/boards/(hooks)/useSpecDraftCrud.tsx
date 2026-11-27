import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import type {
    CardDTO,
    CreateSpecDraftRequest,
    CreateSpecDraftResultDTO,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

/** Upload, create, approve and discard of a spec draft; every success reads the board again. */
export const useSpecDraftCrud = (boardId: string) => {
    const { successAlert, errorAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();
    const draftsCopy = dictionary.apps.app.pages.common.boards.drafts;

    const messageOf = (error: unknown) =>
        handleClientError(new FormattedError(error, locale));
    const showError = (error: unknown) => errorAlert(messageOf(error));

    const refreshCard = (slug: string) =>
        Promise.all([
            queryClient.invalidateQueries({
                queryKey: queryKeys.boards.cards(boardId),
            }),
            queryClient.invalidateQueries({
                queryKey: queryKeys.boards.cardSpec(boardId, slug),
            }),
            queryClient.invalidateQueries({
                queryKey: queryKeys.boards.cardEvents(boardId, slug),
            }),
        ]);

    const uploadAttachmentMutation = useMutation({
        mutationFn: (file: File) =>
            apiClient.boardDraft.uploadAttachment(boardId, file),
    });

    const createDraftMutation = useMutation({
        mutationFn: (body: CreateSpecDraftRequest) =>
            apiClient.boardDraft.create(boardId, body),
        onSuccess: async (result: CreateSpecDraftResultDTO) => {
            queryClient.setQueryData(
                queryKeys.boards.card(boardId, result.card.slug),
                result.card
            );
            successAlert(
                result.run === null
                    ? draftsCopy.newSpec.createdNotQueued
                    : draftsCopy.newSpec.created
            );
            await refreshCard(result.card.slug);
        },
        onError: showError,
    });

    const approveSpecMutation = useMutation({
        mutationFn: (card: CardDTO) =>
            apiClient.boardCard.approveSpec(boardId, card.slug),
        onSuccess: async (approved) => {
            queryClient.setQueryData(
                queryKeys.boards.card(boardId, approved.slug),
                approved
            );
            successAlert(draftsCopy.detail.approved);
            await refreshCard(approved.slug);
        },
        onError: showError,
    });

    const discardDraftMutation = useMutation({
        mutationFn: (card: CardDTO) =>
            apiClient.boardCard.discardDraft(boardId, card.slug),
        onSuccess: async (_result, card) => {
            queryClient.removeQueries({
                queryKey: queryKeys.boards.card(boardId, card.slug),
            });
            successAlert(draftsCopy.detail.discarded);
            await queryClient.invalidateQueries({
                queryKey: queryKeys.boards.cards(boardId),
            });
        },
        onError: showError,
    });

    return {
        messageOf,
        uploadAttachmentMutation,
        createDraftMutation,
        approveSpecMutation,
        discardDraftMutation,
    };
};
