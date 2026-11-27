import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getServerApiClient } from "@/lib/server/apiServerClient";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { queryKeys } from "@/shared/lib/queryKeys";
import { AccountClient } from "./AccountClient";

export const generateMetadata = panelPageMetadata("/account");

export default async function AccountPage() {
    const queryClient = new QueryClient();

    // Prefetch on the server so the page paints without a client waterfall.
    const client = await getServerApiClient();
    if (client) {
        await queryClient.prefetchQuery({
            queryKey: queryKeys.account.me(),
            queryFn: () => client.account.me(),
        });
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <AccountClient />
        </HydrationBoundary>
    );
}
