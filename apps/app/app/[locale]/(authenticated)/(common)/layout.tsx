import { getTranslations } from "@repo/internationalization/server";
import { resolveLocale } from "@repo/internationalization/utils";
import { secure } from "@repo/security";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { env } from "@/env";
import Navbar from "@/shared/components/ui/Navbar";
import { panelTitleTemplate } from "@/shared/lib/panelTitles";

type AppLayoutProperties = {
    readonly children: ReactNode;
    readonly params: Promise<{ locale: string }>;
};

export const generateMetadata = async ({
    params,
}: Pick<AppLayoutProperties, "params">): Promise<Metadata> => {
    const { locale } = await params;
    const dictionary = await getTranslations(resolveLocale(locale));

    return {
        title: panelTitleTemplate(
            dictionary.apps.app.pages.common.routes.platform.boards.list
        ),
    };
};

const AppLayout = async ({ children }: AppLayoutProperties) => {
    if (env.ARCJET_KEY) {
        await secure(["CATEGORY:PREVIEW"]);
    }

    return (
        <div className="flex min-h-dvh flex-col">
            <Navbar />
            <main className="flex flex-1 flex-col">{children}</main>
        </div>
    );
};

export default AppLayout;
