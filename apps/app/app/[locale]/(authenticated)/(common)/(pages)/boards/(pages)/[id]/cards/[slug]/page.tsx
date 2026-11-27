import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { CardDetailClient } from "./CardDetailClient";

export const generateMetadata = panelPageMetadata("/boards/[id]/cards/[slug]");

type CardDetailPageProps = {
    params: Promise<{ id: string; slug: string }>;
};

/** The spec itself is read from GitHub on the client, so a slow repository does not hold the page. */
export default async function CardDetailPage({ params }: CardDetailPageProps) {
    const { id, slug } = await params;
    const queryClient = new QueryClient();

    if (id && slug) {
        const client = await getServerApiClient();
        if (client) {
            await Promise.all([
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.detail(id),
                    queryFn: () => client.board.findById(id),
                }),
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.card(id, slug),
                    queryFn: () => client.boardCard.findBySlug(id, slug),
                }),
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.cardEvents(id, slug),
                    queryFn: () => client.boardCard.listEvents(id, slug),
                }),
            ]);
        }
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <CardDetailClient />
        </HydrationBoundary>
    );
}
