import type { globalTranslations } from "@repo/internationalization/translations/global";
import { withLocalePath } from "@/shared/lib/localePath";

export const COMMON_ROUTES = (
    dictionary: (typeof globalTranslations)[keyof typeof globalTranslations],
    locale: string
) => {
    const buildPath = (path: string) => withLocalePath(locale, path);

    return {
        boards: {
            list: {
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .list,
                url: buildPath("/boards"),
            },
            create: {
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .create,
                url: buildPath("/boards/new"),
            },
            createFor: (repository: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .create,
                url: buildPath(
                    `/boards/new?repository=${encodeURIComponent(repository)}`
                ),
            }),
            detail: (id: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .board,
                url: buildPath(`/boards/${encodeURIComponent(id)}`),
            }),
            card: (id: string, slug: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .card,
                url: buildPath(
                    `/boards/${encodeURIComponent(id)}/cards/${encodeURIComponent(slug)}`
                ),
            }),
            settings: (id: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .settings,
                url: buildPath(`/boards/${encodeURIComponent(id)}/settings`),
            }),
            members: (id: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .members,
                url: buildPath(`/boards/${encodeURIComponent(id)}/members`),
            }),
            credentials: (id: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .credentials,
                url: buildPath(`/boards/${encodeURIComponent(id)}/credentials`),
            }),
            cycles: (id: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .cycles,
                url: buildPath(`/boards/${encodeURIComponent(id)}/cycles`),
            }),
            newCycle: (id: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .newCycle,
                url: buildPath(`/boards/${encodeURIComponent(id)}/cycles/new`),
            }),
            cycle: (id: string, cycleId: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform.boards
                    .cycle,
                url: buildPath(
                    `/boards/${encodeURIComponent(id)}/cycles/${encodeURIComponent(cycleId)}`
                ),
            }),
        },
        account: {
            root: {
                label: dictionary?.apps.app.pages.common.account.title,
                url: buildPath("/account"),
            },
            profile: {
                label: dictionary?.apps.app.pages.common.account.tabs.profile,
                url: buildPath("/account?tab=profile"),
            },
            preferences: {
                label: dictionary?.apps.app.pages.common.account.tabs
                    .preferences,
                url: buildPath("/account?tab=preferences"),
            },
        },
    };
};
