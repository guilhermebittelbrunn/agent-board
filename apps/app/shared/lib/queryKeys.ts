/**
 * Centralized, typed React Query key factory.
 *
 * Use these instead of scattered string constants so invalidation and cache
 * writes stay consistent across hooks (lists, details) and so server prefetch
 * (RSC) and client hooks share the exact same keys.
 *
 * Hierarchy enables prefix invalidation: invalidating `entities.all` clears
 * every entity query; `entities.list()` clears just the list, etc.
 */
export const queryKeys = {
    account: {
        all: ["account"] as const,
        me: () => [...queryKeys.account.all, "me"] as const,
    },
    boards: {
        all: ["boards"] as const,
        list: () => [...queryKeys.boards.all, "list"] as const,
        detail: (id: string) =>
            [...queryKeys.boards.all, "detail", id] as const,
        repositories: () => [...queryKeys.boards.all, "repositories"] as const,
        preview: (repository: string) =>
            [...queryKeys.boards.all, "preview", repository] as const,
        members: (id: string) =>
            [...queryKeys.boards.all, "members", id] as const,
        cards: (id: string) => [...queryKeys.boards.all, "cards", id] as const,
        card: (id: string, slug: string) =>
            [...queryKeys.boards.cards(id), "detail", slug] as const,
        cardSpec: (id: string, slug: string) =>
            [...queryKeys.boards.cards(id), "spec", slug] as const,
        cardEvents: (id: string, slug: string) =>
            [...queryKeys.boards.cards(id), "events", slug] as const,
    },
    runners: {
        all: ["runners"] as const,
        list: () => [...queryKeys.runners.all, "list"] as const,
    },
    entities: {
        all: ["entities"] as const,
        list: () => [...queryKeys.entities.all, "list"] as const,
        summary: () => [...queryKeys.entities.all, "summary"] as const,
        detail: (id: string) =>
            [...queryKeys.entities.all, "detail", id] as const,
    },
    notifications: {
        all: ["notifications"] as const,
        list: () => [...queryKeys.notifications.all, "list"] as const,
        unreadCount: () =>
            [...queryKeys.notifications.all, "unreadCount"] as const,
    },
    users: {
        all: ["users"] as const,
        // `type` is part of the key because the API scopes the listing server-side —
        // the admin list and the impersonation (common-only) list are different data.
        list: (type?: string) =>
            [...queryKeys.users.all, "list", type ?? "all"] as const,
        summary: () => [...queryKeys.users.all, "summary"] as const,
        activitySummary: () =>
            [...queryKeys.users.all, "activitySummary"] as const,
        detail: (id: string) => [...queryKeys.users.all, "detail", id] as const,
    },
    health: () => ["health"] as const,
} as const;
