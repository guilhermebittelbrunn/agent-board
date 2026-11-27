"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import type { BoardConfig } from "@repo/kanban-contract";
import type { CycleDecisionDTO, CycleDTO } from "@repo/sdk/src/types";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { stageColumnName } from "./stageColumnName";

type CycleDecisionsProps = {
    decisions: CycleDecisionDTO[];
    cycle: Pick<CycleDTO, "items">;
    config: Pick<BoardConfig, "stages">;
    boardsDictionary: BoardsDictionary;
    /** `review` lists only the product decisions, under their own title. */
    variant: "all" | "review";
};

/**
 * The decisions agents reported in the cycle. Their text is the agent's data, so it is shown
 * as plain text, never rendered as markdown or HTML.
 */
export function CycleDecisions({
    decisions,
    cycle,
    config,
    boardsDictionary,
    variant,
}: CycleDecisionsProps) {
    const detailCopy = boardsDictionary.cycles.detail;
    const decisionsCopy = detailCopy.decisions;
    const reviewCopy = detailCopy.review;
    const shown =
        variant === "review"
            ? decisions.filter((decision) => decision.product)
            : decisions;
    const titleOf = new Map(cycle.items.map((item) => [item.slug, item.title]));

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <h3 className="font-semibold text-base">
                    {variant === "review"
                        ? reviewCopy.title
                        : decisionsCopy.title}
                </h3>
                {variant === "review" ? (
                    <p className="text-muted-foreground text-sm">
                        {reviewCopy.description}
                    </p>
                ) : null}
            </div>
            {shown.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    {variant === "review"
                        ? reviewCopy.empty
                        : decisionsCopy.empty}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {shown.map((decision, index) => (
                        <li
                            className="flex flex-col gap-2 rounded-lg border bg-card p-3"
                            key={`${decision.eventId}-${index}`}
                        >
                            <span className="text-muted-foreground text-xs">
                                {fillMessage(decisionsCopy.where, {
                                    spec:
                                        titleOf.get(decision.slug) ??
                                        decision.slug,
                                    stage:
                                        stageColumnName(
                                            config,
                                            decision.stageKey,
                                            boardsDictionary
                                        ) ?? decision.stageKey,
                                })}
                            </span>
                            <p className="whitespace-pre-wrap break-words text-sm">
                                {decision.decision}
                            </p>
                            <Badge className="self-start" variant="outline">
                                {decisionsCopy.rule[decision.rule]}
                            </Badge>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
