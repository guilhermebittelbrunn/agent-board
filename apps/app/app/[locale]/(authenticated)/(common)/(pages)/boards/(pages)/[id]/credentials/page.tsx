import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { isImpersonating } from "@/lib/server/panelSnapshot";
import { queryKeys } from "@/shared/lib/queryKeys";
import { BoardCredentialsClient } from "./BoardCredentialsClient";

export const generateMetadata = panelPageMetadata("/boards/[id]/credentials");

type BoardCredentialsPageProps = {
    params: Promise<{ id: string }>;
};

export default async function BoardCredentialsPage({
    params,
}: BoardCredentialsPageProps) {
    const { id } = await params;
    const queryClient = new QueryClient();

    if (id && !(await isImpersonating())) {
        const client = await getServerApiClient("common");
        if (client) {
            await Promise.all([
                queryClient.prefetchQuery({
                    queryKey: queryKeys.boards.detail(id),
                    queryFn: () => client.board.findById(id),
                }),
                queryClient.prefetchQuery({
                    queryKey: queryKeys.runners.list(),
                    queryFn: () => client.runner.list(),
                }),
            ]);
        }
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <BoardCredentialsClient />
        </HydrationBoundary>
    );
}
