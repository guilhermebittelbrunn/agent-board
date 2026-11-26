import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import type { RunnerDTO } from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export const useRunnerCrud = () => {
    const { successAlert, errorAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();
    const credentialsCopy = dictionary.apps.app.pages.common.boards.credentials;

    const showError = (error: unknown) =>
        errorAlert(handleClientError(new FormattedError(error, locale)));

    const createRegistrationMutation = useMutation({
        mutationFn: () => apiClient.runner.createRegistration(),
        onError: showError,
    });

    const revokeMutation = useMutation({
        mutationFn: (runner: RunnerDTO) => apiClient.runner.revoke(runner.id),
        onSuccess: (_result, runner) => {
            queryClient.setQueryData<RunnerDTO[]>(
                queryKeys.runners.list(),
                (current) =>
                    current?.filter((candidate) => candidate.id !== runner.id)
            );
            successAlert(credentialsCopy.revokeDialog.success);
        },
        onError: showError,
    });

    return { createRegistrationMutation, revokeMutation };
};
