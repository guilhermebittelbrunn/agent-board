import type { BoardCredentialsDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export async function fetchBoardCredentials(
    boardId: string | undefined
): Promise<BoardCredentialsDTO | undefined> {
    if (!boardId) {
        return;
    }
    return await apiClient.boardCredential.list(boardId);
}

export function useListBoardCredentials(boardId: string | undefined) {
    const { data, isLoading, error, refetch, isFetching } = useAuthorizedQuery({
        queryKey: queryKeys.boards.credentials(boardId ?? ""),
        queryFn: () => fetchBoardCredentials(boardId),
        enabled: Boolean(boardId),
    });

    return { data, isLoading, error, refetch, isFetching };
}
