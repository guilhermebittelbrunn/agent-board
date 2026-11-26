import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import type { BoardConfig, BoardConfigIssue } from "@repo/kanban-contract";
import type { BoardRawStageDTO } from "@repo/sdk/src/types";
import { TriangleAlertIcon } from "lucide-react";
import {
    type BoardsDictionary,
    fillMessage,
    stageIndexOf,
} from "./boardConfigIssueMessage";

type PreviewStage = {
    key: string | null;
    column: string | null;
    command: string | null;
    model: string | null;
    effort: string | null;
    approval: string | null;
    onRework: string | null;
    onPrComment: string | null;
};

type BoardColumnsPreviewProps = {
    config: BoardConfig | null;
    rawStages: BoardRawStageDTO[] | null;
    issues: BoardConfigIssue[];
    boardsDictionary: BoardsDictionary;
};

function previewStages(
    config: BoardConfig | null,
    rawStages: BoardRawStageDTO[] | null
): PreviewStage[] {
    if (config) {
        return config.stages.map((stage) => ({
            key: stage.key,
            column: stage.column,
            command: stage.command,
            model: stage.model,
            effort: stage.effort,
            approval: stage.approval,
            onRework: stage.onRework ?? null,
            onPrComment: stage.onPrComment ?? null,
        }));
    }
    return (rawStages ?? []).map((stage) => ({
        ...stage,
        effort: null,
        approval: null,
        onPrComment: null,
    }));
}

type StageColumnCardProps = {
    stage: PreviewStage;
    hasIssue: boolean;
    reworkColumn: string | null;
    columnsCopy: BoardsDictionary["wizard"]["columns"];
    effortCopy: Record<string, string>;
};

function StageColumnCard({
    stage,
    hasIssue,
    reworkColumn,
    columnsCopy,
    effortCopy,
}: StageColumnCardProps) {
    const summary = [
        stage.command,
        stage.model,
        stage.effort ? (effortCopy[stage.effort] ?? stage.effort) : null,
    ].filter(Boolean);
    const approvalLine = {
        optional: columnsCopy.approvalOptional,
        required: columnsCopy.approvalRequired,
    }[stage.approval ?? ""];

    return (
        <Card
            className={cn("h-full gap-1 p-4", hasIssue && "border-destructive")}
        >
            <span className="flex min-w-0 items-center gap-2 break-words font-semibold">
                {stage.column ?? columnsCopy.untitledStage}
                {hasIssue ? (
                    <TriangleAlertIcon
                        aria-label={columnsCopy.stageError}
                        className="size-4 text-destructive"
                        role="img"
                    />
                ) : null}
            </span>
            {summary.length > 0 ? (
                <span className="font-mono text-muted-foreground text-xs">
                    {summary.join(" · ")}
                </span>
            ) : null}
            {approvalLine ? (
                <span className="text-xs">{approvalLine}</span>
            ) : null}
            {reworkColumn ? (
                <span className={cn("text-xs", hasIssue && "text-destructive")}>
                    {fillMessage(columnsCopy.reworkTo, {
                        column: reworkColumn,
                    })}
                </span>
            ) : null}
            {stage.onPrComment ? (
                <span className="text-xs">
                    {fillMessage(columnsCopy.prComment, {
                        command: stage.onPrComment,
                    })}
                </span>
            ) : null}
            {hasIssue ? (
                <span className="text-destructive text-xs">
                    {columnsCopy.stageError}
                </span>
            ) : null}
        </Card>
    );
}

export function BoardColumnsPreview({
    config,
    rawStages,
    issues,
    boardsDictionary,
}: BoardColumnsPreviewProps) {
    const columnsCopy = boardsDictionary.wizard.columns;
    const effortCopy = boardsDictionary.effort as Record<string, string>;
    const stages = previewStages(config, rawStages);
    const stagesWithIssue = new Set(
        issues.map(stageIndexOf).filter((index) => index !== null)
    );
    const columnOfKey = new Map(
        stages.map((stage) => [stage.key, stage.column])
    );

    return (
        <section className="flex flex-col gap-3">
            <h2 className="font-semibold text-lg">{columnsCopy.title}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <li>
                    <Card className="h-full gap-1 p-4">
                        <span className="font-semibold">
                            {columnsCopy.backlog.title}
                        </span>
                        {config ? (
                            <span className="text-muted-foreground text-xs">
                                {fillMessage(columnsCopy.backlog.body, {
                                    status: config.backlog.readyStatus,
                                    index: config.backlog.index,
                                })}
                            </span>
                        ) : null}
                    </Card>
                </li>
                {stages.map((stage, index) => (
                    <li key={`${stage.key ?? "stage"}-${index}`}>
                        <StageColumnCard
                            columnsCopy={columnsCopy}
                            effortCopy={effortCopy}
                            hasIssue={stagesWithIssue.has(index)}
                            reworkColumn={
                                stage.onRework
                                    ? (columnOfKey.get(stage.onRework) ??
                                      stage.onRework)
                                    : null
                            }
                            stage={stage}
                        />
                    </li>
                ))}
                <li>
                    <Card className="h-full gap-1 p-4">
                        <span className="font-semibold">
                            {columnsCopy.done.title}
                        </span>
                        <span className="text-muted-foreground text-xs">
                            {columnsCopy.done.body}
                        </span>
                    </Card>
                </li>
            </ul>
        </section>
    );
}
