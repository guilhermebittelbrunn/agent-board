"use client";

import { Table } from "@repo/design-system/components/ui";
import type { BoardConfig, StageConfig } from "@repo/kanban-contract";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type BoardStagesTableProps = {
    config: BoardConfig;
    boardsDictionary: BoardsDictionary;
};

export function BoardStagesTable({
    config,
    boardsDictionary,
}: BoardStagesTableProps) {
    const tableCopy = boardsDictionary.settings.table;
    const runnersCopy = boardsDictionary.runners;
    const approvalCopy = boardsDictionary.approval;
    const effortCopy = boardsDictionary.effort;
    const columnOfKey = new Map(
        config.stages.map((stage) => [stage.key, stage.column])
    );

    const runnersLabel = (runners: StageConfig["runners"]) => {
        if (runners.length === 1 && runners[0] === "local") {
            return runnersCopy.onlyLocal;
        }
        return runners
            .map((runner) =>
                runner === "github-actions"
                    ? runnersCopy.githubActions
                    : runnersCopy[runner]
            )
            .join(", ");
    };

    const columns = [
        {
            title: tableCopy.column,
            dataIndex: "column",
            render: (value: string) => (
                <span className="font-medium">{value}</span>
            ),
        },
        {
            title: tableCopy.commandAndAgent,
            dataIndex: "command",
            render: (value: string, stage: StageConfig) => (
                <span className="font-mono text-sm">
                    {stage.agent ? `${value} · ${stage.agent}` : value}
                </span>
            ),
        },
        {
            title: tableCopy.model,
            dataIndex: "model",
            render: (value: string, stage: StageConfig) =>
                `${value} · ${effortCopy[stage.effort]}`,
        },
        {
            title: tableCopy.runners,
            dataIndex: "runners",
            render: (value: StageConfig["runners"]) => runnersLabel(value),
        },
        {
            title: tableCopy.reworkTo,
            dataIndex: "onRework",
            render: (value: string | undefined) =>
                value
                    ? (columnOfKey.get(value) ?? value)
                    : boardsDictionary.wizard.rules.none,
        },
        {
            title: tableCopy.approval,
            dataIndex: "approval",
            render: (value: StageConfig["approval"]) => approvalCopy[value],
        },
    ];

    return (
        <Table<StageConfig>
            columns={columns}
            dataSource={config.stages}
            locale={{ emptyText: tableCopy.empty }}
            pagination={false}
            rowKey={(stage) => stage.key}
        />
    );
}
