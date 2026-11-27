import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { buttonVariants } from "@repo/design-system/components/ui/button";
import { ModeToggle } from "@repo/design-system/components/ui/mode-toggle";
import { getTranslations } from "@repo/internationalization/server";
import { resolveLocale } from "@repo/internationalization/utils";
import { getBrand } from "@repo/next-config/brand";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { withLocalePath } from "@/shared/lib/localePath";

const VIDEO_WIDTH = 880;
const VIDEO_HEIGHT = 495;
// With autoplay, Chrome ignores preload="metadata" and downloads the hidden video in full; a media query on
// the sources keeps reduced-motion visitors from fetching it at all.
const MOTION_ALLOWED_QUERY = "(prefers-reduced-motion: no-preference)";
const POSTER_SRC = "/landing/agent-board-poster.png";

type LandingPageProps = {
    readonly params: Promise<{ locale: string }>;
};

export const generateMetadata = async ({
    params,
}: LandingPageProps): Promise<Metadata> => {
    const { locale } = await params;
    const dictionary = await getTranslations(resolveLocale(locale));
    const landing = dictionary.apps.app.pages.landing;

    return createMetadata({
        title: landing.metaTitle,
        description: landing.metaDescription,
    });
};

export default async function LandingPage({ params }: LandingPageProps) {
    const { locale } = await params;
    const dictionary = await getTranslations(resolveLocale(locale));
    const landing = dictionary.apps.app.pages.landing;
    const brand = getBrand();

    return (
        <div className="flex min-h-dvh flex-col">
            <header className="flex h-16 items-center justify-between gap-2 border-border border-b px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-8 w-8">
                        <AvatarImage alt="" src={brand.logoUrl ?? undefined} />
                        <AvatarFallback>
                            {brand.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium text-sm">
                        {brand.name}
                    </span>
                </div>
                <ModeToggle />
            </header>
            <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-6 px-4 py-12 text-center">
                <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                    {brand.name}
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                    {landing.tagline}
                </p>
                <video
                    aria-label={landing.videoLabel}
                    autoPlay
                    className="aspect-video w-full rounded-lg border motion-reduce:hidden"
                    height={VIDEO_HEIGHT}
                    loop
                    muted
                    playsInline
                    poster={POSTER_SRC}
                    preload="metadata"
                    width={VIDEO_WIDTH}
                >
                    <source
                        media={MOTION_ALLOWED_QUERY}
                        src="/landing/agent-board.webm"
                        type="video/webm"
                    />
                    <source
                        media={MOTION_ALLOWED_QUERY}
                        src="/landing/agent-board.mp4"
                        type="video/mp4"
                    />
                </video>
                <Image
                    alt={landing.videoLabel}
                    className="hidden aspect-video w-full rounded-lg border motion-reduce:block"
                    height={VIDEO_HEIGHT}
                    src={POSTER_SRC}
                    unoptimized
                    width={VIDEO_WIDTH}
                />
                <Link
                    className={buttonVariants({ size: "lg" })}
                    href={withLocalePath(locale, "/sign-in")}
                >
                    <FaGithub aria-hidden />
                    {landing.signIn}
                </Link>
            </main>
        </div>
    );
}
