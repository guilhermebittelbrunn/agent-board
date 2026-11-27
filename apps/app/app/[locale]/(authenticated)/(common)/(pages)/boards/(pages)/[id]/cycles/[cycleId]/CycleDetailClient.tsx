"use client";

import { getDictionary } from "@repo/internationalization/client";
import { canTriggerStages } from "@repo/kanban-contract";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { COMMON_ROUTES } from "../../../../../../paths";
import { CycleActivity } from "../../../../(components)/CycleActivity";
import { CycleDecisions } from "../../../../(components)/CycleDecisions";
import { CycleProgressTable } from "../../../../(components)/CycleProgressTable";
import { CycleSummary } from "../../../../(components)/CycleSummary";
import { cycleCounters } from "../../../../(components)/cycleCounters";
import { cycleProgress } from "../../../../(components)/cycleProgress";
import { StopCycleDialog } from "../../../../(components)/StopCycleDialog";
import { useBoardCycleCrud } from "../../../../(hooks)/useBoardCycleCrud";
import { useFindBoardById } from "../../../../(hooks)/useFindBoardById";
import { useFindBoardCycleById } from "../../../../(hooks)/useFindBoardCycleById";

export function CycleDetailClient() {
    const params = useParams<{ id: string; cycleId: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const cycleId = typeof params.cycleId === "string" ? params.cycleId : "";
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const cyclesCopy = boardsDictionary.cycles;
    const [isStopOpen, setIsStopOpen] = useState(false);

    const {
        data: board,
        isLoading: isBoardLoading,
        error: boardError,
    } = useFindBoardById(id);
    const {
        data: detail,
        isLoading: isCycleLoading,
        error: cycleError,
    } = useFindBoardCycleById(id, cycleId);
    const { stopCycleMutation } = useBoardCycleCrud(id);

    const error = boardError ?? cycleError;
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isLoading = isBoardLoading || isCycleLoading;
    const canTrigger = canTriggerStages(board?.access.effectiveRole ?? null);
    const stages = board?.config.stages ?? [];

    return (
        <>
            <Header
                breadcrumbs={[
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                    {
                        label: board?.name ?? cyclesCopy.detail.back,
                        href: routes.boards.cycles(id).url,
                    },
                ]}
                page={routes.boards.cycle(id, cycleId).label}
            />
            <Container
                loadError={
                    loadError ??
                    (detail || isLoading ? null : cyclesCopy.detail.notFound)
                }
                loading={isLoading}
            >
                {detail && board ? (
                    <div className="flex w-full min-w-0 flex-col gap-8">
                        <CycleSummary
                            boardsDictionary={boardsDictionary}
                            canStop={canTrigger}
                            counters={cycleCounters(
                                detail.cycle,
                                detail.cards,
                                detail.decisions,
                                new Date()
                            )}
                            cycle={detail.cycle}
                            onStop={() => setIsStopOpen(true)}
                        />
                        {detail.cycle.status === "queued" ? (
                            <p className="text-muted-foreground text-sm">
                                {cyclesCopy.detail.progress.queuedHint}
                            </p>
                        ) : (
                            <CycleProgressTable
                                boardsDictionary={boardsDictionary}
                                rows={cycleProgress(
                                    detail.cycle,
                                    detail.cards,
                                    stages
                                )}
                                stages={stages}
                            />
                        )}
                        <div className="grid gap-8 lg:grid-cols-2">
                            <CycleDecisions
                                boardsDictionary={boardsDictionary}
                                config={board.config}
                                cycle={detail.cycle}
                                decisions={detail.decisions}
                                variant="all"
                            />
                            <div className="flex flex-col gap-8">
                                <CycleDecisions
                                    boardsDictionary={boardsDictionary}
                                    config={board.config}
                                    cycle={detail.cycle}
                                    decisions={detail.decisions}
                                    variant="review"
                                />
                                <CycleActivity
                                    activity={detail.activity}
                                    boardsDictionary={boardsDictionary}
                                    config={board.config}
                                    cycle={detail.cycle}
                                />
                            </div>
                        </div>
                        <StopCycleDialog
                            boardsDictionary={boardsDictionary}
                            isPending={stopCycleMutation.isPending}
                            onCancel={() => setIsStopOpen(false)}
                            onConfirm={() =>
                                stopCycleMutation.mutate(detail.cycle.id, {
                                    onSettled: () => setIsStopOpen(false),
                                })
                            }
                            open={isStopOpen}
                        />
                    </div>
                ) : null}
            </Container>
        </>
    );
}
