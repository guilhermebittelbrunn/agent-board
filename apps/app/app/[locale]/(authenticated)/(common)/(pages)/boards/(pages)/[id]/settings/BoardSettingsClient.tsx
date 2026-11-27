"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { getDictionary } from "@repo/internationalization/client";
import { canConfigureBoard } from "@repo/kanban-contract";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { RefreshCwIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { COMMON_ROUTES } from "../../../../../paths";
import { BoardReloadResult } from "../../../(components)/BoardReloadResult";
import { BoardSectionNav } from "../../../(components)/BoardSectionNav";
import { BoardStageSettingsForm } from "../../../(components)/BoardStageSettingsForm";
import { BoardStagesTable } from "../../../(components)/BoardStagesTable";
import { fillMessage } from "../../../(components)/boardConfigIssueMessage";
import { shortSha } from "../../../(components)/shortSha";
import { useBoardCrud } from "../../../(hooks)/useBoardCrud";
import { useFindBoardById } from "../../../(hooks)/useFindBoardById";

type ReloadConfigButtonProps = {
    isPending: boolean;
    label: string;
    onReload: () => void;
};

function ReloadConfigButton({
    isPending,
    label,
    onReload,
}: ReloadConfigButtonProps) {
    return (
        <Button
            loading={isPending}
            onClick={onReload}
            type="button"
            variant="outline"
        >
            {isPending ? null : <RefreshCwIcon />}
            {label}
        </Button>
    );
}

export function BoardSettingsClient() {
    const params = useParams<{ id: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const { data: board, isLoading, error } = useFindBoardById(id);
    const { reloadBoardMutation, updateStageSettingsMutation } = useBoardCrud();
    const formatDateTime = useFormatDisplayDateTime();
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const settingsCopy = boardsDictionary.settings;

    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const canReload = canConfigureBoard(board?.access.effectiveRole ?? null);
    const reloadResult =
        reloadBoardMutation.data && reloadBoardMutation.variables === id
            ? reloadBoardMutation.data
            : null;

    return (
        <>
            <Header
                breadcrumbs={[
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                ]}
                page={board?.name ?? settingsCopy.title}
            />
            <Container
                header={
                    <div className="flex flex-col gap-4">
                        <BoardSectionNav
                            active="settings"
                            boardsDictionary={boardsDictionary}
                            links={{
                                board: routes.boards.detail(id).url,
                                settings: routes.boards.settings(id).url,
                                members: routes.boards.members(id).url,
                                credentials: routes.boards.credentials(id).url,
                            }}
                        />
                        <PageHeader
                            description={settingsCopy.subtitle}
                            title={settingsCopy.title}
                        />
                    </div>
                }
                loadError={
                    loadError ??
                    (board || isLoading ? null : settingsCopy.loadError)
                }
                loading={isLoading}
            >
                {board ? (
                    <div className="flex w-full flex-col gap-6">
                        <Card className="flex-row flex-wrap items-center gap-3 p-5">
                            <div className="flex min-w-56 flex-1 flex-col gap-1">
                                <span className="font-mono font-semibold">
                                    {board.configSource.path}
                                </span>
                                <span className="text-muted-foreground text-sm">
                                    {fillMessage(settingsCopy.readAt, {
                                        ref: board.configSource.ref,
                                        sha: shortSha(board.configSource.sha),
                                        date: formatDateTime(
                                            board.configSource.readAt
                                        ),
                                    })}
                                </span>
                            </div>
                            {canReload ? (
                                <ReloadConfigButton
                                    isPending={reloadBoardMutation.isPending}
                                    label={settingsCopy.reload}
                                    onReload={() =>
                                        reloadBoardMutation.mutate(board.id)
                                    }
                                />
                            ) : null}
                        </Card>
                        {reloadResult ? (
                            <BoardReloadResult
                                boardsDictionary={boardsDictionary}
                                result={reloadResult}
                            />
                        ) : null}
                        <BoardStagesTable
                            boardsDictionary={boardsDictionary}
                            config={board.config}
                        />
                        <BoardStageSettingsForm
                            board={board}
                            boardsDictionary={boardsDictionary}
                            canEdit={canReload}
                            isSaving={updateStageSettingsMutation.isPending}
                            onSave={(body) =>
                                updateStageSettingsMutation.mutateAsync({
                                    id: board.id,
                                    body,
                                })
                            }
                        />
                    </div>
                ) : null}
            </Container>
        </>
    );
}
