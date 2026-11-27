import type { globalTranslations } from "@repo/internationalization/translations/global";
import { getBrand } from "@repo/next-config/brand";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

export type PanelTitleTemplate = {
    default: string;
    template: string;
};

export function panelTitleTemplate(
    areaName: string,
    brandName = getBrand().name
): PanelTitleTemplate {
    return {
        default: `${areaName} | ${brandName}`,
        template: `%s | ${brandName}`,
    };
}

export const PANEL_PAGE_TITLES = {
    "/boards": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.routes.platform.boards.list,
    "/boards/new": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.routes.platform.boards.create,
    "/boards/[id]": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.routes.platform.boards.board,
    "/boards/[id]/cards/[slug]": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.routes.platform.boards.card,
    "/boards/[id]/settings": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.routes.platform.boards.settings,
    "/boards/[id]/members": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.routes.platform.boards.members,
    "/boards/[id]/credentials": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.routes.platform.boards.credentials,
    "/account": (dictionary: Dictionary) =>
        dictionary.apps.app.pages.common.account.title,
} as const;

export type PanelPageRoute = keyof typeof PANEL_PAGE_TITLES;
