import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import type {
    BoardReloadResultDTO,
    BoardViewDTO,
    UpdateBoardStageSettingsRequest,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorCodeOf } from "@/shared/lib/apiErrorCode";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

/** The file changed between the preview and the click: read it again so the screen shows why. */
const STALE_PREVIEW_CODES = new Set([
    "BOARD_CONFIG_INVALID",
    "BOARD_CONFIG_NOT_FOUND",
    "BOARD_ALREADY_EXISTS",
]);

type UseBoardCrudOptions = {
    onCreated?: (board: BoardViewDTO) => void;
};

export const useBoardCrud = ({ onCreated }: UseBoardCrudOptions = {}) => {
    const { errorAlert, successAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();

    const formatClientError = (error: unknown) =>
        handleClientError(new FormattedError(error, locale));

    const createBoardMutation = useMutation({
        mutationFn: (repository: string) =>
            apiClient.board.create({ repository }),
        onSuccess: async (board) => {
            queryClient.setQueryData(queryKeys.boards.detail(board.id), board);
            await queryClient.invalidateQueries({
                queryKey: queryKeys.boards.list(),
            });
            await queryClient.invalidateQueries({
                queryKey: queryKeys.boards.repositories(),
            });
            onCreated?.(board);
        },
        onError: async (error, repository) => {
            errorAlert(formatClientError(error));
            const code = apiErrorCodeOf(error);
            if (code && STALE_PREVIEW_CODES.has(code)) {
                await queryClient.invalidateQueries({
                    queryKey: queryKeys.boards.preview(repository),
                });
            }
        },
    });

    const reloadBoardMutation = useMutation({
        mutationFn: (id: string): Promise<BoardReloadResultDTO> =>
            apiClient.board.reload(id),
        onSuccess: async (result, id) => {
            if (result.outcome !== "updated") {
                return;
            }
            queryClient.setQueryData(queryKeys.boards.detail(id), result.board);
            await queryClient.invalidateQueries({
                queryKey: queryKeys.boards.list(),
            });
        },
        onError: (error) => errorAlert(formatClientError(error)),
    });

    const updateStageSettingsMutation = useMutation({
        mutationFn: (input: {
            id: string;
            body: UpdateBoardStageSettingsRequest;
        }): Promise<BoardViewDTO> =>
            apiClient.board.updateStageSettings(input.id, input.body),
        onSuccess: async (board) => {
            queryClient.setQueryData(queryKeys.boards.detail(board.id), board);
            successAlert(
                dictionary.apps.app.pages.common.boards.settings.stageSettings
                    .saved
            );
            await queryClient.invalidateQueries({
                queryKey: queryKeys.boards.list(),
            });
        },
        onError: (error) => errorAlert(formatClientError(error)),
    });

    return {
        createBoardMutation,
        reloadBoardMutation,
        updateStageSettingsMutation,
    };
};
