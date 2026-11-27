"use client";

import type { BoardConfig } from "@repo/kanban-contract";
import type { CycleActivityDTO, CycleDTO } from "@repo/sdk/src/types";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { stageColumnName } from "./stageColumnName";

type CycleActivityProps = {
    activity: CycleActivityDTO[];
    cycle: Pick<CycleDTO, "items">;
    config: Pick<BoardConfig, "stages">;
    boardsDictionary: BoardsDictionary;
};

const HEADING_MARKS = /^#+\s*/;

/** The first line of an update or report, as plain text: the full text stays on the card. */
export function activityHeadline(markdown: string): string {
    const line =
        markdown
            .split("\n")
            .map((candidate) => candidate.trim())
            .find((candidate) => candidate !== "") ?? "";
    return line.replace(HEADING_MARKS, "");
}

export function CycleActivity({
    activity,
    cycle,
    config,
    boardsDictionary,
}: CycleActivityProps) {
    const formatDateTime = useFormatDisplayDateTime();
    const activityCopy = boardsDictionary.cycles.detail.activity;
    const titleOf = new Map(cycle.items.map((item) => [item.slug, item.title]));

    return (
        <section className="flex flex-col gap-3">
            <h3 className="font-semibold text-base">{activityCopy.title}</h3>
            {activity.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    {activityCopy.empty}
                </p>
            ) : (
                <ol className="flex flex-col gap-3">
                    {activity.map((entry) => (
                        <li className="flex flex-col gap-1" key={entry.eventId}>
                            <span className="text-muted-foreground text-xs">
                                {fillMessage(activityCopy.where, {
                                    time: formatDateTime(entry.at),
                                    spec: titleOf.get(entry.slug) ?? entry.slug,
                                    stage:
                                        stageColumnName(
                                            config,
                                            entry.stageKey,
                                            boardsDictionary
                                        ) ?? entry.stageKey,
                                })}
                            </span>
                            <p className="break-words text-sm">
                                {activityHeadline(entry.markdown)}
                            </p>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
