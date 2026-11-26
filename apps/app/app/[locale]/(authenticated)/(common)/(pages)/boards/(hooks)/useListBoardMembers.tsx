import type { BoardMemberDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export async function fetchBoardMembers(
    boardId: string | undefined
): Promise<BoardMemberDTO[] | undefined> {
    if (!boardId) {
        return;
    }
    return await apiClient.boardMember.list(boardId);
}

export function useListBoardMembers(boardId: string | undefined) {
    const { data, isLoading, error, refetch, isFetching } = useAuthorizedQuery({
        queryKey: queryKeys.boards.members(boardId ?? ""),
        queryFn: () => fetchBoardMembers(boardId),
        enabled: Boolean(boardId),
    });

    return { data: data ?? [], isLoading, error, refetch, isFetching };
}
