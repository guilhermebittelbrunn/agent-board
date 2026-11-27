import { buttonVariants } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

export type BoardSection =
    | "board"
    | "cycles"
    | "members"
    | "settings"
    | "credentials";

type BoardSectionNavProps = {
    active: BoardSection;
    links: Record<BoardSection, string>;
    boardsDictionary: BoardsDictionary;
};

const SECTIONS: BoardSection[] = [
    "board",
    "cycles",
    "members",
    "settings",
    "credentials",
];

export function BoardSectionNav({
    active,
    links,
    boardsDictionary,
}: BoardSectionNavProps) {
    const navCopy = boardsDictionary.nav;

    return (
        <nav aria-label={navCopy.label} className="flex flex-wrap gap-1">
            {SECTIONS.map((section) => (
                <Link
                    aria-current={section === active ? "page" : undefined}
                    className={buttonVariants({
                        variant: section === active ? "secondary" : "ghost",
                        size: "sm",
                    })}
                    href={links[section]}
                    key={section}
                >
                    {navCopy[section]}
                </Link>
            ))}
        </nav>
    );
}
