import type { RunnerDTO } from "@repo/sdk/src/types";
import { useAuthorizedQuery } from "@/shared/hooks/useAuthorizedQuery";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";

const POLL_MS = 5000;

export async function fetchRunnerList(): Promise<RunnerDTO[]> {
    return await apiClient.runner.list();
}

/**
 * The signed-in person's runners. `poll` refreshes the list while something is about to
 * change on its own: a code waiting for a runner, or a runner busy with a stage.
 */
export function useListRunners({ poll }: { poll: boolean }) {
    const { data, isLoading, error, refetch, isFetching } = useAuthorizedQuery({
        queryKey: queryKeys.runners.list(),
        queryFn: fetchRunnerList,
        refetchInterval: poll ? POLL_MS : false,
    });

    return { data: data ?? [], isLoading, error, refetch, isFetching };
}
