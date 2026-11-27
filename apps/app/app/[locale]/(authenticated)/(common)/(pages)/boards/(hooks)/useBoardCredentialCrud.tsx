import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import type {
    BoardCredentialsDTO,
    SaveScheduledTaskRequest,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { fillMessage } from "../(components)/boardConfigIssueMessage";

export type ScheduledTaskTarget = { stageKey: string; column: string };

export const useBoardCredentialCrud = (boardId: string) => {
    const { successAlert, errorAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();
    const cloudCopy = dictionary.apps.app.pages.common.boards.credentials.cloud;
    const queryKey = queryKeys.boards.credentials(boardId);

    const showError = (error: unknown) =>
        errorAlert(handleClientError(new FormattedError(error, locale)));

    const saveMutation = useMutation({
        mutationFn: ({
            target,
            body,
        }: {
            target: ScheduledTaskTarget;
            body: SaveScheduledTaskRequest;
        }) =>
            apiClient.boardCredential.saveScheduledTask(
                boardId,
                target.stageKey,
                body
            ),
        onSuccess: (saved, { target }) => {
            queryClient.setQueryData<BoardCredentialsDTO>(
                queryKey,
                (current) =>
                    current && {
                        ...current,
                        scheduledTasks: [
                            ...current.scheduledTasks.filter(
                                (task) => task.stageKey !== saved.stageKey
                            ),
                            saved,
                        ],
                    }
            );
            successAlert(
                fillMessage(cloudCopy.dialog.saved, { stage: target.column })
            );
        },
        onError: showError,
    });

    const removeMutation = useMutation({
        mutationFn: (target: ScheduledTaskTarget) =>
            apiClient.boardCredential.removeScheduledTask(
                boardId,
                target.stageKey
            ),
        onSuccess: (_result, target) => {
            queryClient.setQueryData<BoardCredentialsDTO>(
                queryKey,
                (current) =>
                    current && {
                        ...current,
                        scheduledTasks: current.scheduledTasks.filter(
                            (task) => task.stageKey !== target.stageKey
                        ),
                    }
            );
            successAlert(
                fillMessage(cloudCopy.removeDialog.removed, {
                    stage: target.column,
                })
            );
        },
        onError: showError,
    });

    return { saveMutation, removeMutation };
};
