"use client";

import { ApiAuthProvider } from "@/shared/providers/ApiAuthProvider";

type ClientLayoutProps = {
    readonly children: React.ReactNode;
    readonly actorUid: string | null;
};

/**
 * Deliberately does not touch the SDK headers: `ApiAuthProvider` is their single owner.
 * Two writers race, because React runs child effects before the parent's.
 */
export default function ClientLayout({
    children,
    actorUid,
}: ClientLayoutProps) {
    return (
        <ApiAuthProvider actorUid={actorUid}>
            <div>{children}</div>
        </ApiAuthProvider>
    );
}
