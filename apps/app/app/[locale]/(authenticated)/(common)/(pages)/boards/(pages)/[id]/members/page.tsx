import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { BoardMembersClient } from "./BoardMembersClient";

export const generateMetadata = panelPageMetadata("/boards/[id]/members");

type BoardMembersPageProps = {
    params: Promise<{ id: string }>;
};

export default async function BoardMembersPage({
    params,
}: BoardMembersPageProps) {
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
                    queryKey: queryKeys.boards.members(id),
                    queryFn: () => client.boardMember.list(id),
                }),
            ]);
        }
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <BoardMembersClient />
        </HydrationBoundary>
    );
}
