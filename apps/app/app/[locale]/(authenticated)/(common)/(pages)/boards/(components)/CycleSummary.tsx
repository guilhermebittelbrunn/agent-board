"use client";

import { Button } from "@repo/design-system/components/ui/button";
import type { CycleDTO } from "@repo/sdk/src/types";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { CycleStatusBadge } from "./CycleStatusBadge";
import { type CycleCounters, splitElapsed } from "./cycleCounters";

type CycleSummaryProps = {
    cycle: CycleDTO;
    counters: CycleCounters;
    canStop: boolean;
    onStop: () => void;
    boardsDictionary: BoardsDictionary;
};

const isLive = (cycle: Pick<CycleDTO, "status">) =>
    cycle.status === "running" || cycle.status === "queued";

function summaryLine(cycle: CycleDTO, boardsDictionary: BoardsDictionary) {
    const cyclesCopy = boardsDictionary.cycles;
    const count = cycle.items.length;
    return fillMessage(
        count === 1 ? cyclesCopy.detail.summaryOne : cyclesCopy.detail.summary,
        {
            count,
            concurrency:
                cycle.options.concurrency === 2
                    ? cyclesCopy.concurrency.two
                    : cyclesCopy.concurrency.one,
            until: cyclesCopy.until[cycle.options.until],
            login: cycle.startedByLogin,
        }
    );
}

function endReasonLine(cycle: CycleDTO, boardsDictionary: BoardsDictionary) {
    if (cycle.endReason === null) {
        return null;
    }
    return fillMessage(boardsDictionary.cycles.endReason[cycle.endReason], {
        login: cycle.stoppedByLogin ?? "",
    });
}

function Counter({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
            <span className="font-semibold text-2xl tabular-nums">{value}</span>
            <span className="text-muted-foreground text-xs">{label}</span>
        </div>
    );
}

function CycleCounterGrid({
    cycle,
    counters,
    boardsDictionary,
}: Pick<CycleSummaryProps, "cycle" | "counters" | "boardsDictionary">) {
    const detailCopy = boardsDictionary.cycles.detail;
    const untilPullRequest = cycle.options.until === "pull_request";
    const reached = untilPullRequest ? counters.pullRequests : counters.done;
    const elapsed =
        counters.elapsedMs === null ? null : splitElapsed(counters.elapsedMs);

    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Counter
                label={
                    untilPullRequest
                        ? detailCopy.counters.pullRequests
                        : detailCopy.counters.done
                }
                value={`${reached} / ${cycle.items.length}`}
            />
            <Counter
                label={detailCopy.counters.decisions}
                value={String(counters.decisions)}
            />
            <Counter
                label={detailCopy.counters.review}
                value={String(counters.review)}
            />
            {elapsed === null ? null : (
                <Counter
                    label={
                        isLive(cycle)
                            ? detailCopy.counters.elapsed
                            : detailCopy.counters.total
                    }
                    value={fillMessage(
                        elapsed.hours > 0
                            ? detailCopy.elapsed.hours
                            : detailCopy.elapsed.minutes,
                        elapsed
                    )}
                />
            )}
        </div>
    );
}

export function CycleSummary({
    cycle,
    counters,
    canStop,
    onStop,
    boardsDictionary,
}: CycleSummaryProps) {
    const formatDateTime = useFormatDisplayDateTime();
    const detailCopy = boardsDictionary.cycles.detail;
    const title =
        cycle.startedAt === null
            ? fillMessage(detailCopy.queuedTitle, {
                  date: formatDateTime(cycle.createdAt),
              })
            : fillMessage(detailCopy.title, {
                  date: formatDateTime(cycle.startedAt),
              });
    const endReason = endReasonLine(cycle, boardsDictionary);

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-lg">{title}</h2>
                        <CycleStatusBadge
                            boardsDictionary={boardsDictionary}
                            status={cycle.status}
                        />
                    </div>
                    <p className="text-muted-foreground text-sm">
                        {summaryLine(cycle, boardsDictionary)}
                    </p>
                    {endReason ? (
                        <p className="text-muted-foreground text-sm">
                            {endReason}
                        </p>
                    ) : null}
                </div>
                {canStop && isLive(cycle) ? (
                    <Button onClick={onStop} type="button" variant="outline">
                        {detailCopy.stop.button}
                    </Button>
                ) : null}
            </div>
            {cycle.status === "queued" ? null : (
                <CycleCounterGrid
                    boardsDictionary={boardsDictionary}
                    counters={counters}
                    cycle={cycle}
                />
            )}
        </section>
    );
}
