"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { CardDTO } from "@repo/sdk/src/types";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type CycleSpecPickerProps = {
    cards: readonly CardDTO[];
    /** Slugs in the order they were picked, which is the order the cycle runs them. */
    selected: readonly string[];
    onChange: (slugs: string[]) => void;
    disabled?: boolean;
    boardsDictionary: BoardsDictionary;
    describedBy?: string;
};

/** Toggling a spec appends it to the end or takes it out, keeping the others in order. */
export function toggleSlug(
    selected: readonly string[],
    slug: string
): string[] {
    return selected.includes(slug)
        ? selected.filter((candidate) => candidate !== slug)
        : [...selected, slug];
}

export function CycleSpecPicker({
    cards,
    selected,
    onChange,
    disabled = false,
    boardsDictionary,
    describedBy,
}: CycleSpecPickerProps) {
    const specsCopy = boardsDictionary.cycles.new.specs;

    if (cards.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">{specsCopy.empty}</p>
        );
    }

    return (
        <ul aria-describedby={describedBy} className="flex flex-col gap-2">
            {cards.map((card) => {
                const index = selected.indexOf(card.slug);
                const picked = index !== -1;
                return (
                    <li key={card.id}>
                        <button
                            aria-pressed={picked}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                                picked
                                    ? "border-primary bg-primary/5"
                                    : "border-border bg-card hover:bg-muted/50"
                            )}
                            disabled={disabled}
                            onClick={() =>
                                onChange(toggleSlug(selected, card.slug))
                            }
                            type="button"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs",
                                    picked
                                        ? "bg-primary text-primary-foreground"
                                        : "border border-muted-foreground/60"
                                )}
                            >
                                {picked ? index + 1 : null}
                            </span>
                            <span className="flex min-w-0 flex-col">
                                <span className="break-words font-medium">
                                    {card.title}
                                </span>
                                <span className="break-all font-mono text-muted-foreground text-xs">
                                    {card.slug}
                                </span>
                            </span>
                            {picked ? (
                                <span className="sr-only">
                                    {fillMessage(specsCopy.position, {
                                        position: index + 1,
                                    })}
                                </span>
                            ) : null}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
