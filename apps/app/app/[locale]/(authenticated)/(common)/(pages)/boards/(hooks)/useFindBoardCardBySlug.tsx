import type { CardDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { activeRunRefetchInterval } from "../(components)/hasActiveRun";

export async function findBoardCardBySlug(
    boardId: string | undefined,
    slug: string | undefined
): Promise<CardDTO | undefined> {
    if (!(boardId && slug)) {
        return;
    }
    return await apiClient.boardCard.findBySlug(boardId, slug);
}

export function useFindBoardCardBySlug(
    boardId: string | undefined,
    slug: string | undefined
) {
    const { data, isLoading, error } = useAuthorizedQuery({
        queryKey: queryKeys.boards.card(boardId ?? "", slug ?? ""),
        queryFn: () => findBoardCardBySlug(boardId, slug),
        enabled: Boolean(boardId && slug),
        refetchInterval: (query) => activeRunRefetchInterval(query.state.data),
        refetchIntervalInBackground: false,
    });

    return { data, isLoading, error };
}
