"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
    type BoardConfig,
    findStageConfig,
    resolveBranchName,
} from "@repo/kanban-contract";
import type { BoardViewDTO, CardDTO } from "@repo/sdk/src/types";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { stageColumnName } from "./stageColumnName";

export type TriggerKind = "drag" | "rerun" | "approve";

export type TriggerRequest = {
    card: CardDTO;
    stageKey: string;
    kind: TriggerKind;
};

type TriggerStageDialogProps = {
    request: TriggerRequest | null;
    board: Pick<BoardViewDTO, "config" | "executor" | "stageSettings">;
    /** Every card of the board, to tell whether the column is at its limit. */
    cards: readonly CardDTO[];
    isPending: boolean;
    boardsDictionary: BoardsDictionary;
    onConfirm: (request: TriggerRequest) => void;
    onCancel: () => void;
    onCloseAutoFocus?: (event: Event) => void;
};

function branchOf(card: CardDTO, config: BoardConfig): string {
    if (card.branch) {
        return card.branch;
    }
    try {
        return resolveBranchName(config, card.slug);
    } catch {
        return "";
    }
}

function isColumnFull(
    request: TriggerRequest,
    wipLimit: number | null,
    cards: readonly CardDTO[]
): boolean {
    if (wipLimit === null) {
        return false;
    }
    const running = cards.filter(
        (card) =>
            card.id !== request.card.id &&
            card.lane === "stage" &&
            card.stageKey === request.stageKey &&
            card.state === "running"
    ).length;
    return running >= wipLimit;
}

/** Confirms a stage run before it starts, showing what the agent will run and where. */
export function TriggerStageDialog({
    request,
    board,
    cards,
    isPending,
    boardsDictionary,
    onConfirm,
    onCancel,
    onCloseAutoFocus,
}: TriggerStageDialogProps) {
    const triggerCopy = boardsDictionary.trigger;
    const stage =
        request === null || request === undefined
            ? undefined
            : findStageConfig(board.config, request.stageKey);
    const column =
        stageColumnName(
            board.config,
            request?.stageKey ?? null,
            boardsDictionary
        ) ?? "";
    const wipLimit = stage
        ? (board.stageSettings[stage.key]?.wipLimit ?? null)
        : null;
    const kind = request?.kind ?? "drag";
    const title = {
        drag: triggerCopy.title,
        rerun: triggerCopy.rerunTitle,
        approve: triggerCopy.approveTitle,
    }[kind];
    const confirm = {
        drag: fillMessage(triggerCopy.confirm, { column }),
        rerun: triggerCopy.confirmRerun,
        approve: triggerCopy.confirmApprove,
    }[kind];
    const description = fillMessage(
        {
            drag: triggerCopy.description,
            rerun: triggerCopy.rerunDescription,
            approve: triggerCopy.approveDescription,
        }[kind],
        { title: request?.card.title, column }
    );

    const details =
        request && stage
            ? [
                  {
                      label: triggerCopy.command,
                      value: `${stage.command} ${request.card.slug}`,
                      mono: true,
                  },
                  {
                      label: triggerCopy.modelAndEffort,
                      value: `${stage.model} · ${boardsDictionary.effort[stage.effort]}`,
                      mono: false,
                  },
                  {
                      label: triggerCopy.branch,
                      value: branchOf(request.card, board.config),
                      mono: true,
                  },
                  {
                      label: triggerCopy.limit,
                      value: fillMessage(triggerCopy.turns, {
                          count: board.config.limits.maxTurnsPerStage,
                      }),
                      mono: false,
                  },
              ]
            : [];

    return (
        <Dialog
            onOpenChange={(open) => {
                if (!open) {
                    onCancel();
                }
            }}
            open={request !== null}
        >
            <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>{fillMessage(title, { column })}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {details.map((detail) => (
                        <div
                            className="flex min-w-0 flex-col gap-1"
                            key={detail.label}
                        >
                            <dt className="text-muted-foreground text-xs">
                                {detail.label}
                            </dt>
                            <dd
                                className={
                                    detail.mono
                                        ? "break-all font-mono text-sm"
                                        : "text-sm"
                                }
                            >
                                {detail.value}
                            </dd>
                        </div>
                    ))}
                </dl>
                {request && isColumnFull(request, wipLimit, cards) ? (
                    <p className="text-muted-foreground text-sm">
                        {fillMessage(triggerCopy.wipFull, {
                            column,
                            wip: wipLimit,
                        })}
                    </p>
                ) : null}
                {board.executor === "fake" ? (
                    <p className="text-muted-foreground text-sm">
                        {triggerCopy.fakeExecutor}
                    </p>
                ) : null}
                {board.executor === "local" ? (
                    <p className="text-muted-foreground text-sm">
                        {triggerCopy.localExecutor}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button onClick={onCancel} type="button" variant="outline">
                        {kind === "drag"
                            ? triggerCopy.cancel
                            : triggerCopy.cancelRerun}
                    </Button>
                    <Button
                        loading={isPending}
                        onClick={() => {
                            if (request) {
                                onConfirm(request);
                            }
                        }}
                        type="button"
                    >
                        {confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
