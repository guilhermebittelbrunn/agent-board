import type { BoardViewDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export function fetchBoardsList(): Promise<BoardViewDTO[]> {
    return apiClient.board.list();
}

export function useListBoards() {
    const { data, isLoading, error, refetch, isFetching } = useAuthorizedQuery({
        queryKey: queryKeys.boards.list(),
        queryFn: fetchBoardsList,
    });

    return { data: data ?? [], isLoading, error, refetch, isFetching };
}
