"use client";

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { ModeToggle } from "@repo/design-system/components/ui/mode-toggle";
import { getDictionary } from "@repo/internationalization/client";
import { getBrand } from "@repo/next-config/brand";
import Link from "next/link";
import { withLocalePath } from "@/shared/lib/localePath";
import ProfileDropdown from "./ProfileDropdown";

export default function Navbar() {
    const { dictionary, locale } = getDictionary();
    const brand = getBrand();
    const iconButtonProps = {
        className: "h-9 w-9 rounded-full bg-sidebar-border p-0",
    };

    return (
        <nav
            className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-2 border-border border-b bg-sidebar/95 px-3 backdrop-blur supports-backdrop-filter:bg-sidebar/80 sm:px-4"
            data-panel-navbar=""
        >
            <Link
                aria-label={dictionary.apps.app.pages.navbar.homeLinkLabel}
                className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={withLocalePath(locale, "/boards")}
            >
                <Avatar className="h-8 w-8">
                    <AvatarImage alt="" src={brand.logoUrl ?? undefined} />
                    <AvatarFallback>
                        {brand.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <span className="truncate font-medium text-sm">
                    {brand.name}
                </span>
            </Link>
            <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
                <ModeToggle triggerProps={iconButtonProps} />
                <ProfileDropdown />
            </div>
        </nav>
    );
}
