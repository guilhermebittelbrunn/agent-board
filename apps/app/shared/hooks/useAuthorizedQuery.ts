"use client";

import {
    type QueryKey,
    type UseQueryOptions,
    type UseQueryResult,
    useQuery,
} from "@tanstack/react-query";
import { useSdkAuthorized } from "@/shared/providers/ApiAuthProvider";

/**
 * `useQuery` for data the API only serves to an authenticated caller.
 *
 * It withholds the request until the SDK carries the bearer token. A query that fires
 * first comes back 401 and React Query caches that failure, so the screen stays empty
 * until a manual refresh.
 *
 * ⚠️ Use this, not `useQuery`, in every hook that reads authenticated data.
 */
export function useAuthorizedQuery<
    TQueryFnData,
    TError = Error,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
>(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): UseQueryResult<TData, TError> {
    const sdkAuthorized = useSdkAuthorized();

    return useQuery({
        ...options,
        enabled: (options.enabled ?? true) && sdkAuthorized,
    });
}
