import type { BoardImportPreviewDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export async function fetchBoardImportPreview(
    repository: string | null
): Promise<BoardImportPreviewDTO | undefined> {
    if (!repository) {
        return;
    }
    return await apiClient.board.preview(repository);
}

export function usePreviewBoardImport(repository: string | null) {
    const { data, isLoading, error, refetch, isFetching } = useAuthorizedQuery({
        queryKey: queryKeys.boards.preview(repository ?? ""),
        queryFn: () => fetchBoardImportPreview(repository),
        enabled: Boolean(repository),
        staleTime: 0,
    });

    return { data, isLoading, error, refetch, isFetching };
}
