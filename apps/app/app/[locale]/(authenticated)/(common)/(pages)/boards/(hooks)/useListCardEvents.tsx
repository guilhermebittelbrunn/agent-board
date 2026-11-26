import type { CardEventViewDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

export async function fetchCardEvents(
    boardId: string | undefined,
    slug: string | undefined
): Promise<CardEventViewDTO[] | undefined> {
    if (!(boardId && slug)) {
        return;
    }
    return await apiClient.boardCard.listEvents(boardId, slug);
}

export function useListCardEvents(
    boardId: string | undefined,
    slug: string | undefined
) {
    const { data, isLoading, error } = useAuthorizedQuery({
        queryKey: queryKeys.boards.cardEvents(boardId ?? "", slug ?? ""),
        queryFn: () => fetchCardEvents(boardId, slug),
        enabled: Boolean(boardId && slug),
    });

    return { data: data ?? [], isLoading, error };
}
