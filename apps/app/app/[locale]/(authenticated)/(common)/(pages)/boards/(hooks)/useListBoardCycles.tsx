import type { CycleDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { activeCycleRefetchInterval } from "../(components)/cycleRefetch";

export async function fetchBoardCycleList(
    boardId: string | undefined
): Promise<CycleDTO[] | undefined> {
    if (!boardId) {
        return;
    }
    return await apiClient.boardCycle.list(boardId);
}

export function useListBoardCycles(boardId: string | undefined) {
    const { data, isLoading, error, refetch, isFetching } = useAuthorizedQuery({
        queryKey: queryKeys.boards.cycles(boardId ?? ""),
        queryFn: () => fetchBoardCycleList(boardId),
        enabled: Boolean(boardId),
        refetchInterval: (query) =>
            activeCycleRefetchInterval(query.state.data),
        refetchIntervalInBackground: false,
    });

    return { data: data ?? [], isLoading, error, refetch, isFetching };
}
