/**
 * Centralized, typed React Query key factory.
 *
 * Use these instead of scattered string constants so invalidation and cache
 * writes stay consistent across hooks (lists, details) and so server prefetch
 * (RSC) and client hooks share the exact same keys.
 *
 * Hierarchy enables prefix invalidation: invalidating `boards.all` clears
 * every board query; `boards.list()` clears just the list, etc.
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
        credentials: (id: string) =>
            [...queryKeys.boards.all, "credentials", id] as const,
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
    health: () => ["health"] as const,
} as const;
