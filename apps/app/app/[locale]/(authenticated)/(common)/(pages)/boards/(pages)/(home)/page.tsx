import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { BoardsListClient } from "./BoardsListClient";

export const generateMetadata = panelPageMetadata("/boards");

export default async function BoardsListPage() {
    const queryClient = new QueryClient();

    // would answer with the admin's own boards.
    const client = await getServerApiClient();
    if (client) {
        await queryClient.prefetchQuery({
            queryKey: queryKeys.boards.list(),
            queryFn: () => client.board.list(),
        });
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <BoardsListClient />
        </HydrationBoundary>
    );
}
