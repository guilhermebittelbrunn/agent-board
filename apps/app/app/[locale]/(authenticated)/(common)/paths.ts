import type { globalTranslations } from "@repo/internationalization/translations/global";
import { withLocalePath } from "@/shared/lib/localePath";

export const COMMON_ROUTES = (
    dictionary: (typeof globalTranslations)[keyof typeof globalTranslations],
    locale: string
) => {
    const buildPath = (path: string) => withLocalePath(locale, path);

    return {
        root: {
            label: dictionary?.apps.app.pages.common.routes.home,
            url: buildPath("/"),
        },
        playground: {
            label: dictionary?.apps.app.pages.common.routes.platform.playground,
            url: buildPath("/playground"),
        },
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
        },
        entities: {
            list: {
                label: dictionary?.apps.app.pages.common.routes.platform
                    .entities.list,
                url: buildPath("/entities"),
            },
            create: {
                label: dictionary?.apps.app.pages.common.routes.platform
                    .entities.create,
                url: buildPath("/entities/create"),
            },
            update: (id: string) => ({
                label: dictionary?.apps.app.pages.common.routes.platform
                    .entities.update,
                url: buildPath(`/entities/edit/${id}`),
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
            security: {
                label: dictionary?.apps.app.pages.common.account.tabs.security,
                url: buildPath("/account?tab=security"),
            },
            preferences: {
                label: dictionary?.apps.app.pages.common.account.tabs
                    .preferences,
                url: buildPath("/account?tab=preferences"),
            },
        },
    };
};
