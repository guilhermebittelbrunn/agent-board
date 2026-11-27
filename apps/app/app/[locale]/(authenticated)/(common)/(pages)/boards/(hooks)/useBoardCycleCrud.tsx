import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import type { CreateCycleRequest } from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { COMMON_ROUTES } from "../../../paths";

export const useBoardCycleCrud = (boardId: string) => {
    const { successAlert, errorAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();
    const router = useRouter();
    const cyclesCopy = dictionary.apps.app.pages.common.boards.cycles;
    const routes = COMMON_ROUTES(dictionary, locale);

    const showError = (error: unknown) =>
        errorAlert(handleClientError(new FormattedError(error, locale)));

    const refreshBoard = () =>
        Promise.all([
            queryClient.invalidateQueries({
                queryKey: queryKeys.boards.cycles(boardId),
            }),
            queryClient.invalidateQueries({
                queryKey: queryKeys.boards.cards(boardId),
            }),
        ]);

    const createCycleMutation = useMutation({
        mutationFn: (body: CreateCycleRequest) =>
            apiClient.boardCycle.create(boardId, body),
        onSuccess: async (cycle) => {
            successAlert(
                cycle.status === "queued"
                    ? cyclesCopy.new.queued
                    : cyclesCopy.new.created
            );
            await refreshBoard();
            router.push(routes.boards.cycle(boardId, cycle.id).url);
        },
        onError: showError,
    });

    const stopCycleMutation = useMutation({
        mutationFn: (cycleId: string) =>
            apiClient.boardCycle.stop(boardId, cycleId),
        onSuccess: async () => {
            successAlert(cyclesCopy.detail.stop.done);
            await refreshBoard();
        },
        onError: showError,
    });

    return { createCycleMutation, stopCycleMutation };
};
