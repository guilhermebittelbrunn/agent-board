"use client";

import useAuth from "@repo/auth/provider";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { apiClient } from "@/shared/lib/client";

const SdkAuthorizedContext = createContext(false);

/**
 * `apiClient` is a module singleton shared by the whole process: writing a visitor's
 * token into it while rendering on the server would hand it to other concurrent requests.
 * Server Components reach the API through their own per-request client.
 */
function applyBearer(token: string | null): void {
    if (typeof window === "undefined" || !token) {
        return;
    }
    apiClient.setAuthorizationHeader(token);
}

/**
 * The single owner of the SDK's `Authorization` header. The token is written during
 * render, not in an effect: React runs a child's effects (and so its first query) before
 * the parent's, and the render that flips `useSdkAuthorized()` to true must already find
 * the header in place. The write is idempotent. The header is removed only when the server
 * reports no session (`actorUid === null`), never while the token is still resolving.
 */
export function ApiAuthProvider({
    actorUid,
    children,
}: {
    readonly actorUid: string | null;
    readonly children: ReactNode;
}) {
    const { accessToken } = useAuth();

    if (actorUid) {
        applyBearer(accessToken);
    }

    useEffect(() => {
        if (!actorUid) {
            apiClient.removeHeader("Authorization");
        }
    }, [actorUid]);

    const sdkAuthorized = Boolean(actorUid && accessToken);

    return (
        <SdkAuthorizedContext.Provider value={sdkAuthorized}>
            {children}
        </SdkAuthorizedContext.Provider>
    );
}

/** Whether the SDK already carries the bearer token, so an authenticated query can fire. */
export function useSdkAuthorized(): boolean {
    return useContext(SdkAuthorizedContext);
}
