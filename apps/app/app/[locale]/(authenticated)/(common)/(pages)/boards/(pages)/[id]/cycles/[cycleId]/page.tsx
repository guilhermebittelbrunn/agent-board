import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { CycleDetailClient } from "./CycleDetailClient";

export const generateMetadata = panelPageMetadata(
    "/boards/[id]/cycles/[cycleId]"
);

type CycleDetailPageProps = {
    params: Promise<{ id: string; cycleId: string }>;
};

export default async function CycleDetailPage({
    params,
}: CycleDetailPageProps) {
    const { id, cycleId } = await params;
    const queryClient = new QueryClient();

    if (id && cycleId) {
        const client = await getServerApiClient();
        if (client) {
            await Promise.all([
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.detail(id),
                    queryFn: () => client.board.findById(id),
                }),
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.cycle(id, cycleId),
                    queryFn: () => client.boardCycle.findById(id, cycleId),
                }),
            ]);
        }
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <CycleDetailClient />
        </HydrationBoundary>
    );
}
