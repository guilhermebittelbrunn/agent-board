"use client";

import { Table } from "@repo/design-system/components/ui";
import { buttonVariants } from "@repo/design-system/components/ui/button";
import { getDictionary } from "@repo/internationalization/client";
import { canTriggerStages } from "@repo/kanban-contract";
import type { CycleDTO } from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { COMMON_ROUTES } from "../../../../../paths";
import { BoardSectionNav } from "../../../(components)/BoardSectionNav";
import { fillMessage } from "../../../(components)/boardConfigIssueMessage";
import { CycleStatusBadge } from "../../../(components)/CycleStatusBadge";
import { useFindBoardById } from "../../../(hooks)/useFindBoardById";
import { useListBoardCycles } from "../../../(hooks)/useListBoardCycles";

export function BoardCyclesClient() {
    const params = useParams<{ id: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const formatDateTime = useFormatDisplayDateTime();
    const {
        data: board,
        isLoading: isBoardLoading,
        error: boardError,
    } = useFindBoardById(id);
    const {
        data: cycles,
        isLoading: areCyclesLoading,
        error: cyclesError,
        refetch,
        isFetching,
    } = useListBoardCycles(id);
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const cyclesCopy = boardsDictionary.cycles;
    const listCopy = cyclesCopy.list;

    const error = boardError ?? cyclesError;
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isLoading = isBoardLoading || areCyclesLoading;
    const canTrigger = canTriggerStages(board?.access.effectiveRole ?? null);

    const columns = [
        {
            title: listCopy.columns.startedAt,
            dataIndex: "startedAt",
            render: (_: unknown, cycle: CycleDTO) => (
                <Link
                    className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                    href={routes.boards.cycle(id, cycle.id).url}
                >
                    {cycle.startedAt === null
                        ? fillMessage(listCopy.queuedAt, {
                              date: formatDateTime(cycle.createdAt),
                          })
                        : formatDateTime(cycle.startedAt)}
                </Link>
            ),
        },
        {
            title: listCopy.columns.specs,
            dataIndex: "items",
            render: (_: unknown, cycle: CycleDTO) =>
                cycle.items.length === 1
                    ? listCopy.specsCountOne
                    : fillMessage(listCopy.specsCount, {
                          count: cycle.items.length,
                      }),
        },
        {
            title: listCopy.columns.status,
            dataIndex: "status",
            render: (_: unknown, cycle: CycleDTO) => (
                <CycleStatusBadge
                    boardsDictionary={boardsDictionary}
                    status={cycle.status}
                />
            ),
        },
        {
            title: listCopy.columns.startedBy,
            dataIndex: "startedByLogin",
        },
    ];

    return (
        <>
            <Header
                breadcrumbs={[
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                ]}
                page={board?.name ?? listCopy.title}
            />
            <Container
                header={
                    <div className="flex flex-col gap-4">
                        <BoardSectionNav
                            active="cycles"
                            boardsDictionary={boardsDictionary}
                            links={{
                                board: routes.boards.detail(id).url,
                                cycles: routes.boards.cycles(id).url,
                                settings: routes.boards.settings(id).url,
                                members: routes.boards.members(id).url,
                                credentials: routes.boards.credentials(id).url,
                            }}
                        />
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <PageHeader
                                description={listCopy.description}
                                title={listCopy.title}
                            />
                            {canTrigger ? (
                                <Link
                                    className={buttonVariants()}
                                    href={routes.boards.newCycle(id).url}
                                >
                                    {listCopy.newCycle}
                                </Link>
                            ) : null}
                        </div>
                    </div>
                }
                loadError={
                    loadError ??
                    (board || isLoading ? null : cyclesCopy.loadError)
                }
                loading={isLoading}
            >
                {board ? (
                    <Table<CycleDTO>
                        columns={columns}
                        dataSource={cycles}
                        locale={{ emptyText: listCopy.empty }}
                        onRefresh={() => refetch()}
                        pagination={false}
                        refreshLoading={isFetching}
                        rowKey={(row) => row.id}
                    />
                ) : null}
            </Container>
        </>
    );
}
