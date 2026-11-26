import type { BoardViewDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export async function findBoardById(
    id: string | undefined
): Promise<BoardViewDTO | undefined> {
    if (!id) {
        return;
    }
    return await apiClient.board.findById(id);
}

export function useFindBoardById(id: string | undefined) {
    const { data, isLoading, error } = useAuthorizedQuery({
        queryKey: queryKeys.boards.detail(id ?? ""),
        queryFn: () => findBoardById(id),
        enabled: Boolean(id),
    });

    return { data, isLoading, error };
}
