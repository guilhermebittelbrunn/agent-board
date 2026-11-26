import type { CardSpecContentDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

/** Reads the spec from GitHub on every call, so it is never prefetched on the server. */
export async function findCardSpecBySlug(
    boardId: string | undefined,
    slug: string | undefined
): Promise<CardSpecContentDTO | undefined> {
    if (!(boardId && slug)) {
        return;
    }
    return await apiClient.boardCard.findSpec(boardId, slug);
}

export function useFindCardSpecBySlug(
    boardId: string | undefined,
    slug: string | undefined
) {
    const { data, isLoading, error } = useAuthorizedQuery({
        queryKey: queryKeys.boards.cardSpec(boardId ?? "", slug ?? ""),
        queryFn: () => findCardSpecBySlug(boardId, slug),
        enabled: Boolean(boardId && slug),
    });

    return { data, isLoading, error };
}
