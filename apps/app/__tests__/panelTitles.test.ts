import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { globalTranslations } from "@repo/internationalization/translations/global";
import { locales } from "@repo/internationalization/utils";
import { DEFAULT_BRAND_NAME } from "@repo/next-config/brand";
import { afterEach, describe, expect, it, vi } from "vitest";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import {
    PANEL_PAGE_TITLES,
    type PanelPageRoute,
    panelTitleTemplate,
} from "@/shared/lib/panelTitles";

const AUTHENTICATED_DIR = join(__dirname, "../app/[locale]/(authenticated)");
const PANEL_AREAS = [
    { dir: join(AUTHENTICATED_DIR, "(common)/(pages)"), prefix: [] },
];

type PanelPageFolder = { route: string; dir: string };

/** Every folder with a `page.tsx` in the panel, as the route after the locale. */
const discoverPanelPages = (): PanelPageFolder[] =>
    PANEL_AREAS.flatMap(({ dir, prefix }) =>
        readdirSync(dir, { recursive: true, encoding: "utf8" })
            .filter(
                (file) => file === "page.tsx" || file.endsWith(`${sep}page.tsx`)
            )
            .map((file) => {
                const folder = file.split(sep).slice(0, -1);
                const routeSegments = folder.filter(
                    (segment) => !segment.startsWith("(")
                );
                return {
                    route: `/${[...prefix, ...routeSegments].join("/")}`,
                    dir: join(dir, ...folder),
                };
            })
    );

const registeredRoutes = Object.keys(PANEL_PAGE_TITLES) as PanelPageRoute[];

const WHITESPACE = /\s+/g;

/** The formatter wraps a long call over several lines and adds a trailing comma. */
const withoutFormatting = (source: string) =>
    source.replace(WHITESPACE, "").replaceAll(",)", ")");

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("panelTitleTemplate", () => {
    it("titles the area home with the area name and the brand, and every other screen through the template", () => {
        expect(panelTitleTemplate("Boards", "Marca")).toEqual({
            default: "Boards | Marca",
            template: "%s | Marca",
        });
    });

    it("uses the configured brand by default", () => {
        vi.stubEnv("NEXT_PUBLIC_APP_NAME", "QA Brand");

        expect(panelTitleTemplate("Boards")).toEqual({
            default: "Boards | QA Brand",
            template: "%s | QA Brand",
        });
    });

    it("falls back to the default brand when none is configured", () => {
        vi.stubEnv("NEXT_PUBLIC_APP_NAME", "");

        expect(panelTitleTemplate("Boards").template).toBe(
            `%s | ${DEFAULT_BRAND_NAME}`
        );
    });
});

describe.each(locales)("PANEL_PAGE_TITLES in %s", (locale) => {
    const dictionary = globalTranslations[locale];
    const titleOf = (route: PanelPageRoute) =>
        PANEL_PAGE_TITLES[route](dictionary);

    it("gives every screen a non-empty title", () => {
        for (const route of registeredRoutes) {
            expect(titleOf(route)?.trim(), route).toBeTruthy();
        }
    });

    it("gives each screen a title of its own", () => {
        const titles = registeredRoutes.map(titleOf);

        expect(new Set(titles).size).toBe(titles.length);
    });
});

describe("panel screens on disk", () => {
    it("registers a title for exactly the screens that exist", () => {
        const routesOnDisk = discoverPanelPages()
            .map(({ route }) => route)
            .sort();

        expect([...registeredRoutes].sort()).toEqual(routesOnDisk);
    });

    it.each(discoverPanelPages())(
        "wires $route to its title in the page or in a sibling layout",
        ({ route, dir }) => {
            const call = `panelPageMetadata("${route}")`;
            const sources = ["page.tsx", "layout.tsx"]
                .map((file) => join(dir, file))
                .filter((file) => existsSync(file))
                .map((file) => readFileSync(file, "utf8"));

            expect(
                sources.some((source) =>
                    withoutFormatting(source).includes(
                        withoutFormatting(
                            `export const generateMetadata = ${call}`
                        )
                    )
                ),
                `expected page.tsx or layout.tsx in ${dir} to export generateMetadata = ${call}`
            ).toBe(true);
        }
    );
});

describe("panelPageMetadata", () => {
    const metadataFor = (route: PanelPageRoute, locale: string) =>
        panelPageMetadata(route)({ params: Promise.resolve({ locale }) });

    it.each(locales)(
        "titles the screen in the segment's language (%s)",
        async (locale) => {
            expect((await metadataFor("/boards", locale)).title).toBe(
                globalTranslations[locale].apps.app.pages.common.routes.platform
                    .boards.list
            );
        }
    );

    it("falls back to the default language when the segment is not a supported locale", async () => {
        expect((await metadataFor("/boards/new", "xx")).title).toBe(
            globalTranslations["pt-br"].apps.app.pages.common.routes.platform
                .boards.create
        );
    });
});
