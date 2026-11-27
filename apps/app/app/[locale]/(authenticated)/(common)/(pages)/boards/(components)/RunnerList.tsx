"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import type { BoardDTO, RunnerDTO } from "@repo/sdk/src/types";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { stageColumnName } from "./stageColumnName";

type RunnerListProps = {
    runners: RunnerDTO[];
    board: Pick<BoardDTO, "id" | "config">;
    canRevoke: boolean;
    boardsDictionary: BoardsDictionary;
    onRevoke: (runner: RunnerDTO) => void;
};

/** A run on this board reads by its column; a run on another board only has its stage key here. */
function stageLabel(
    run: NonNullable<RunnerDTO["currentRun"]>,
    board: RunnerListProps["board"],
    boardsDictionary: BoardsDictionary
): string {
    if (run.boardId !== board.id) {
        return run.stageKey;
    }
    return (
        stageColumnName(board.config, run.stageKey, boardsDictionary) ??
        run.stageKey
    );
}

function activityLine(
    runner: RunnerDTO,
    board: RunnerListProps["board"],
    boardsDictionary: BoardsDictionary,
    formatDateTime: (value: string) => string
): string {
    const runnersCopy = boardsDictionary.credentials.runners;
    if (runner.currentRun) {
        return fillMessage(runnersCopy.busy, {
            slug: runner.currentRun.slug,
            stage: stageLabel(runner.currentRun, board, boardsDictionary),
        });
    }
    if (!runner.online) {
        return fillMessage(runnersCopy.offlineSince, {
            date: formatDateTime(runner.lastSeenAt),
        });
    }
    return runnersCopy.idle;
}

export function RunnerList({
    runners,
    board,
    canRevoke,
    boardsDictionary,
    onRevoke,
}: RunnerListProps) {
    const runnersCopy = boardsDictionary.credentials.runners;
    const formatDateTime = useFormatDisplayDateTime();

    if (runners.length === 0) {
        return (
            <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                {runnersCopy.empty}
            </p>
        );
    }

    return (
        <ul className="flex flex-col divide-y rounded-md border">
            {runners.map((runner) => (
                <li
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    key={runner.id}
                >
                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium font-mono text-sm">
                                {runner.name}
                            </span>
                            <Badge
                                variant={runner.online ? "default" : "outline"}
                            >
                                {runner.online
                                    ? runnersCopy.online
                                    : runnersCopy.offline}
                            </Badge>
                        </div>
                        <p className="text-sm">
                            {activityLine(
                                runner,
                                board,
                                boardsDictionary,
                                formatDateTime
                            )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                            {[
                                fillMessage(runnersCopy.registered, {
                                    date: formatDateTime(runner.createdAt),
                                }),
                                fillMessage(runnersCopy.lastSeen, {
                                    date: formatDateTime(runner.lastSeenAt),
                                }),
                                fillMessage(runnersCopy.tokenEnding, {
                                    last4: runner.tokenLast4,
                                }),
                            ].join(" · ")}
                        </p>
                    </div>
                    <Button
                        aria-label={fillMessage(runnersCopy.revokeAria, {
                            name: runner.name,
                        })}
                        className="self-start sm:self-center"
                        disabled={!canRevoke}
                        onClick={() => onRevoke(runner)}
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        {runnersCopy.revoke}
                    </Button>
                </li>
            ))}
        </ul>
    );
}
