import { globalTranslations } from "@repo/internationalization/translations/global";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/design-system/components/ui/mode-toggle", () => ({
    ModeToggle: () => null,
}));

const { default: LandingPage, generateMetadata } = await import(
    "@/app/[locale]/(landing)/page"
);

const landing = globalTranslations["pt-br"].apps.app.pages.landing;
const params = Promise.resolve({ locale: "pt-br" });

async function renderLanding() {
    return render(await LandingPage({ params }));
}

afterEach(cleanup);

describe("landing page", () => {
    it("names the product and states the idea from the dictionary", async () => {
        await renderLanding();

        expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
        expect(screen.getByText(landing.tagline)).toBeTruthy();
    });

    it("plays the board animation muted, looped and inline, webm before mp4", async () => {
        const { container } = await renderLanding();
        const video = container.querySelector("video");

        expect(video).not.toBeNull();
        expect(video?.muted).toBe(true);
        expect(video?.loop).toBe(true);
        expect(video?.hasAttribute("playsinline")).toBe(true);
        expect(video?.getAttribute("aria-label")).toBe(landing.videoLabel);
        expect(video?.getAttribute("poster")).toBe(
            "/landing/agent-board-poster.png"
        );
        expect(
            Array.from(video?.querySelectorAll("source") ?? [], (source) =>
                source.getAttribute("type")
            )
        ).toEqual(["video/webm", "video/mp4"]);
        expect(
            Array.from(video?.querySelectorAll("source") ?? [], (source) =>
                source.getAttribute("media")
            )
        ).toEqual([
            "(prefers-reduced-motion: no-preference)",
            "(prefers-reduced-motion: no-preference)",
        ]);
    });

    it("keeps a still image for reduced motion", async () => {
        await renderLanding();

        const still = screen.getByRole("img", { name: landing.videoLabel });
        expect(still.className).toContain("motion-reduce:block");
    });

    it("links to sign-in in the page locale", async () => {
        await renderLanding();

        const signIn = screen.getByRole("link", { name: landing.signIn });
        expect(signIn.getAttribute("href")).toBe("/pt-br/sign-in");
    });

    it("titles the page from the dictionary", async () => {
        const metadata = await generateMetadata({ params });

        expect(String(metadata.title)).toContain(landing.metaTitle);
        expect(metadata.description).toBe(landing.metaDescription);
    });
});
