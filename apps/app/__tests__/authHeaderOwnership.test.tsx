import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState, headers } = vi.hoisted(() => ({
    authState: { accessToken: null as string | null },
    headers: new Map<string, string>(),
}));

vi.mock("@repo/auth/provider", () => ({
    default: () => authState,
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        setAuthorizationHeader: (token: string) =>
            headers.set("Authorization", `Bearer ${token}`),
        removeHeader: (key: string) => headers.delete(key),
    },
}));

const ClientLayout = (await import("@/app/[locale]/clientLayout")).default;
const { useSdkAuthorized } = await import("@/shared/providers/ApiAuthProvider");

/** What a data hook sees in its first effect, which React runs before the parent's. */
const seenByChildEffect: Array<{
    authorized: boolean;
    authorization: string | undefined;
}> = [];

function QueryingChild() {
    const authorized = useSdkAuthorized();
    useEffect(() => {
        seenByChildEffect.push({
            authorized,
            authorization: headers.get("Authorization"),
        });
    }, [authorized]);
    return <span>{authorized ? "authorized" : "waiting"}</span>;
}

describe("auth header ownership", () => {
    afterEach(cleanup);

    beforeEach(() => {
        headers.clear();
        seenByChildEffect.length = 0;
        authState.accessToken = null;
    });

    it("holds queries back while the token is still resolving", () => {
        render(
            <ClientLayout actorUid="user-7">
                <QueryingChild />
            </ClientLayout>
        );

        expect(screen.getByText("waiting")).toBeTruthy();
        expect(headers.get("Authorization")).toBeUndefined();
    });

    it("writes the bearer before a child's first effect runs", () => {
        authState.accessToken = "token-abc";
        render(
            <ClientLayout actorUid="user-7">
                <QueryingChild />
            </ClientLayout>
        );

        expect(seenByChildEffect[0]).toEqual({
            authorized: true,
            authorization: "Bearer token-abc",
        });
    });

    it("has the header in place in the render that releases the queries", () => {
        const { rerender } = render(
            <ClientLayout actorUid="user-7">
                <QueryingChild />
            </ClientLayout>
        );

        authState.accessToken = "token-abc";
        rerender(
            <ClientLayout actorUid="user-7">
                <QueryingChild />
            </ClientLayout>
        );

        expect(seenByChildEffect.at(-1)).toEqual({
            authorized: true,
            authorization: "Bearer token-abc",
        });
    });

    it("removes the bearer when the server reports no session", () => {
        headers.set("Authorization", "Bearer stale");
        authState.accessToken = "token-abc";
        render(
            <ClientLayout actorUid={null}>
                <QueryingChild />
            </ClientLayout>
        );

        expect(headers.get("Authorization")).toBeUndefined();
        expect(screen.getByText("waiting")).toBeTruthy();
    });

    it("never sends a role or impersonation header", () => {
        authState.accessToken = "token-abc";
        render(
            <ClientLayout actorUid="user-7">
                <QueryingChild />
            </ClientLayout>
        );

        expect([...headers.keys()]).toEqual(["Authorization"]);
    });
});
