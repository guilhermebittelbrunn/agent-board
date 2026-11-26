import type { ImportableRepositoryDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export function fetchImportableRepositories(): Promise<
    ImportableRepositoryDTO[]
> {
    return apiClient.board.listRepositories();
}

export function useListImportableRepositories(enabled = true) {
    const { data, isLoading, error } = useAuthorizedQuery({
        queryKey: queryKeys.boards.repositories(),
        queryFn: fetchImportableRepositories,
        enabled,
    });

    return { data: data ?? [], isLoading, error };
}
