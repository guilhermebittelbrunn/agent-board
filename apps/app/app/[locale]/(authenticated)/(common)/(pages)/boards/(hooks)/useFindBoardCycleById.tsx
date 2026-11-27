import type { CycleDetailDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { activeCycleRefetchInterval } from "../(components)/cycleRefetch";

export async function findBoardCycleById(
    boardId: string | undefined,
    cycleId: string | undefined
): Promise<CycleDetailDTO | undefined> {
    if (!(boardId && cycleId)) {
        return;
    }
    return await apiClient.boardCycle.findById(boardId, cycleId);
}

export function useFindBoardCycleById(
    boardId: string | undefined,
    cycleId: string | undefined
) {
    const { data, isLoading, error, refetch } = useAuthorizedQuery({
        queryKey: queryKeys.boards.cycle(boardId ?? "", cycleId ?? ""),
        queryFn: () => findBoardCycleById(boardId, cycleId),
        enabled: Boolean(boardId && cycleId),
        refetchInterval: (query) =>
            activeCycleRefetchInterval(query.state.data?.cycle),
        refetchIntervalInBackground: false,
    });

    return { data, isLoading, error, refetch };
}
