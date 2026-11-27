import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { BoardClient } from "./BoardClient";

export const generateMetadata = panelPageMetadata("/boards/[id]");

type BoardPageProps = {
    params: Promise<{ id: string }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
    const { id } = await params;
    const queryClient = new QueryClient();

    if (id) {
        const client = await getServerApiClient();
        if (client) {
            await Promise.all([
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.detail(id),
                    queryFn: () => client.board.findById(id),
                }),
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.cards(id),
                    queryFn: () => client.boardCard.list(id),
                }),
            ]);
        }
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <BoardClient />
        </HydrationBoundary>
    );
}
