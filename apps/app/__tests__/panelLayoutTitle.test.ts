import { DEFAULT_BRAND_NAME } from "@repo/next-config/brand";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: {} }));
vi.mock("@repo/security", () => ({ secure: vi.fn() }));
vi.mock("@/shared/components/ui/Navbar", () => ({ default: () => null }));

const { generateMetadata } = await import(
    "@/app/[locale]/(authenticated)/(common)/layout"
);

const titleFor = async (locale: string): Promise<unknown> =>
    (await generateMetadata({ params: Promise.resolve({ locale }) })).title;

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("panel layout title", () => {
    it("names the area after the boards in pt-br", async () => {
        vi.stubEnv("NEXT_PUBLIC_APP_NAME", "");

        expect(await titleFor("pt-br")).toEqual({
            default: `Boards | ${DEFAULT_BRAND_NAME}`,
            template: `%s | ${DEFAULT_BRAND_NAME}`,
        });
    });

    it("falls back to the default locale when the segment is not a supported locale", async () => {
        vi.stubEnv("NEXT_PUBLIC_APP_NAME", "");

        expect(await titleFor("xx")).toEqual({
            default: `Boards | ${DEFAULT_BRAND_NAME}`,
            template: `%s | ${DEFAULT_BRAND_NAME}`,
        });
    });

    it("uses the configured brand name", async () => {
        vi.stubEnv("NEXT_PUBLIC_APP_NAME", "QA Brand");

        expect(await titleFor("pt-br")).toEqual({
            default: "Boards | QA Brand",
            template: "%s | QA Brand",
        });
    });
});
