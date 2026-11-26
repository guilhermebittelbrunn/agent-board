"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { buttonVariants } from "@repo/design-system/components/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@repo/design-system/components/ui/collapsible";
import type { CardDTO } from "@repo/sdk/src/types";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type NotReadyCardsProps = {
    cards: CardDTO[];
    readyStatus: string;
    boardsDictionary: BoardsDictionary;
    cardHref: (slug: string) => string;
};

export function NotReadyCards({
    cards,
    readyStatus,
    boardsDictionary,
    cardHref,
}: NotReadyCardsProps) {
    const notReadyCopy = boardsDictionary.board.notReady;

    return (
        <Collapsible className="flex flex-col gap-3">
            <CollapsibleTrigger
                className={buttonVariants({
                    variant: "ghost",
                    className:
                        "group w-fit gap-2 px-2 font-semibold [&[data-state=open]>svg]:rotate-180",
                })}
            >
                {notReadyCopy.title}
                <span className="font-normal text-muted-foreground text-xs">
                    {fillMessage(notReadyCopy.count, { count: cards.length })}
                </span>
                <ChevronDownIcon
                    aria-hidden
                    className="size-4 transition-transform"
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                    {fillMessage(notReadyCopy.hint, { readyStatus })}
                </p>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {cards.map((card) => (
                        <li
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                            key={card.id}
                        >
                            <Link
                                className="min-w-0 break-words hover:underline"
                                href={cardHref(card.slug)}
                            >
                                {card.title}
                            </Link>
                            <span className="flex items-center gap-1">
                                {card.orphan ? (
                                    <Badge variant="outline">
                                        {boardsDictionary.board.card.orphan}
                                    </Badge>
                                ) : (
                                    <Badge
                                        className="font-mono"
                                        variant="secondary"
                                    >
                                        {card.spec.status}
                                    </Badge>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            </CollapsibleContent>
        </Collapsible>
    );
}
