import type { CardDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { activeRunRefetchInterval } from "../(components)/hasActiveRun";

export async function fetchBoardCards(
    boardId: string | undefined
): Promise<CardDTO[] | undefined> {
    if (!boardId) {
        return;
    }
    return await apiClient.boardCard.list(boardId);
}

export function useListBoardCards(boardId: string | undefined) {
    const { data, isLoading, error, refetch, isFetching } = useAuthorizedQuery({
        queryKey: queryKeys.boards.cards(boardId ?? ""),
        queryFn: () => fetchBoardCards(boardId),
        enabled: Boolean(boardId),
        refetchInterval: (query) => activeRunRefetchInterval(query.state.data),
        refetchIntervalInBackground: false,
    });

    return { data: data ?? [], isLoading, error, refetch, isFetching };
}
