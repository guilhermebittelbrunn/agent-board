import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { BoardCyclesClient } from "./BoardCyclesClient";

export const generateMetadata = panelPageMetadata("/boards/[id]/cycles");

type BoardCyclesPageProps = {
    params: Promise<{ id: string }>;
};

export default async function BoardCyclesPage({
    params,
}: BoardCyclesPageProps) {
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
                    queryKey: queryKeys.boards.cycles(id),
                    queryFn: () => client.boardCycle.list(id),
                }),
            ]);
        }
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <BoardCyclesClient />
        </HydrationBoundary>
    );
}
