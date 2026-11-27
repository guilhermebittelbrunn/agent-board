import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { BoardSettingsClient } from "./BoardSettingsClient";

export const generateMetadata = panelPageMetadata("/boards/[id]/settings");

type BoardSettingsPageProps = {
    params: Promise<{ id: string }>;
};

export default async function BoardSettingsPage({
    params,
}: BoardSettingsPageProps) {
    const { id } = await params;
    const queryClient = new QueryClient();

    if (id) {
        const client = await getServerApiClient();
        if (client) {
            await queryClient.prefetchQuery({
                queryKey: queryKeys.boards.detail(id),
                queryFn: () => client.board.findById(id),
            });
        }
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <BoardSettingsClient />
        </HydrationBoundary>
    );
}
