"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { type StageConfig, stageAcceptsRunner } from "@repo/kanban-contract";
import type {
    BoardCredentialsDTO,
    BoardDTO,
    ScheduledTaskCredentialDTO,
} from "@repo/sdk/src/types";
import type { ScheduledTaskTarget } from "../(hooks)/useBoardCredentialCrud";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type CloudDictionary = BoardsDictionary["credentials"]["cloud"];

type ScheduledTaskTableProps = {
    board: Pick<BoardDTO, "config">;
    credentials: BoardCredentialsDTO;
    canEdit: boolean;
    boardsDictionary: BoardsDictionary;
    onSave: (target: ScheduledTaskTarget) => void;
    onRemove: (target: ScheduledTaskTarget) => void;
};

type ScheduledTaskRowProps = {
    stage: StageConfig;
    task: ScheduledTaskCredentialDTO | undefined;
    canEdit: boolean;
    enabled: boolean;
    cloudCopy: CloudDictionary;
    onSave: (target: ScheduledTaskTarget) => void;
    onRemove: (target: ScheduledTaskTarget) => void;
};

const ROW_GRID =
    "md:grid md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,12rem)_minmax(0,9rem)_minmax(0,10rem)] md:items-center md:gap-4";

function CellLabel({ children }: { children: string }) {
    return (
        <span className="text-muted-foreground text-xs md:hidden">
            {children}
        </span>
    );
}

function rowText(
    acceptsCloud: boolean,
    task: ScheduledTaskCredentialDTO | undefined,
    cloudCopy: CloudDictionary
) {
    if (!acceptsCloud) {
        return {
            status: cloudCopy.status.localOnly,
            url: cloudCopy.localOnlyHint,
            token: cloudCopy.empty,
        };
    }
    if (!task) {
        return {
            status: cloudCopy.status.missing,
            url: cloudCopy.empty,
            token: cloudCopy.empty,
        };
    }
    return {
        status: cloudCopy.status.saved,
        url: fillMessage(cloudCopy.urlHint, { last4: task.triggerIdLast4 }),
        token: fillMessage(cloudCopy.tokenEnding, { last4: task.tokenLast4 }),
    };
}

function ScheduledTaskRow({
    stage,
    task,
    canEdit,
    enabled,
    cloudCopy,
    onSave,
    onRemove,
}: ScheduledTaskRowProps) {
    const target = { stageKey: stage.key, column: stage.column };
    const acceptsCloud = stageAcceptsRunner(stage, "cloud");
    const text = rowText(acceptsCloud, task, cloudCopy);
    const columnsCopy = cloudCopy.columns;

    return (
        <li className={`flex flex-col gap-2 p-4 ${ROW_GRID}`}>
            <span className="min-w-0 truncate font-medium text-sm">
                {stage.column}
            </span>
            <span className="flex flex-col gap-1">
                <CellLabel>{columnsCopy.status}</CellLabel>
                <Badge className="w-fit" variant={task ? "default" : "outline"}>
                    {text.status}
                </Badge>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
                <CellLabel>{columnsCopy.url}</CellLabel>
                <span className="truncate font-mono text-xs">{text.url}</span>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
                <CellLabel>{columnsCopy.token}</CellLabel>
                <span className="truncate font-mono text-xs">{text.token}</span>
            </span>
            {acceptsCloud && canEdit ? (
                <span className="flex flex-wrap gap-2">
                    <Button
                        aria-label={fillMessage(
                            task ? cloudCopy.replaceAria : cloudCopy.addAria,
                            { stage: stage.column }
                        )}
                        disabled={!enabled}
                        onClick={() => onSave(target)}
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        {task ? cloudCopy.replace : cloudCopy.add}
                    </Button>
                    {task ? (
                        <Button
                            aria-label={fillMessage(cloudCopy.removeAria, {
                                stage: stage.column,
                            })}
                            onClick={() => onRemove(target)}
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            {cloudCopy.remove}
                        </Button>
                    ) : null}
                </span>
            ) : (
                <span className="hidden md:block" />
            )}
        </li>
    );
}

/** One row per stage of the board.yml; a stage that does not accept the cloud shows why, without actions. */
export function ScheduledTaskTable({
    board,
    credentials,
    canEdit,
    boardsDictionary,
    onSave,
    onRemove,
}: ScheduledTaskTableProps) {
    const cloudCopy = boardsDictionary.credentials.cloud;
    const columnsCopy = cloudCopy.columns;
    const byStage = new Map(
        credentials.scheduledTasks.map((task) => [task.stageKey, task])
    );

    return (
        <section
            aria-labelledby="cloud-title"
            className="flex min-w-0 flex-col gap-4"
        >
            <div className="flex flex-col gap-1">
                <h2 className="font-semibold" id="cloud-title">
                    {cloudCopy.title}
                </h2>
                <p className="text-muted-foreground text-sm">
                    {cloudCopy.description}
                </p>
                {credentials.cloudCredentialsEnabled ? null : (
                    <p className="rounded-md border border-dashed p-3 text-sm">
                        {cloudCopy.disabled}
                    </p>
                )}
            </div>
            <ul className="flex flex-col divide-y rounded-md border">
                <li
                    aria-hidden
                    className={`hidden px-4 py-2 font-medium text-muted-foreground text-xs ${ROW_GRID}`}
                >
                    <span>{columnsCopy.stage}</span>
                    <span>{columnsCopy.status}</span>
                    <span>{columnsCopy.url}</span>
                    <span>{columnsCopy.token}</span>
                    <span>{columnsCopy.action}</span>
                </li>
                {board.config.stages.map((stage) => (
                    <ScheduledTaskRow
                        canEdit={canEdit}
                        cloudCopy={cloudCopy}
                        enabled={credentials.cloudCredentialsEnabled}
                        key={stage.key}
                        onRemove={onRemove}
                        onSave={onSave}
                        stage={stage}
                        task={byStage.get(stage.key)}
                    />
                ))}
            </ul>
        </section>
    );
}
