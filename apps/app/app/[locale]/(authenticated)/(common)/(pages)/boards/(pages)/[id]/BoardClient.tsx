"use client";

import { getDictionary } from "@repo/internationalization/client";
import { canPrioritizeCards, canTriggerStages } from "@repo/kanban-contract";
import type {
    BoardViewDTO,
    CardDTO,
    CardSyncSkipDTO,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { ImpersonationReadOnlyNotice } from "@/shared/components/ui/ImpersonationReadOnlyNotice";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useAuthRequestPanel } from "@/shared/providers/AuthRequestPanelContext";
import { COMMON_ROUTES } from "../../../../paths";
import { BoardBacklogEmpty } from "../../(components)/BoardBacklogEmpty";
import { BoardColumns } from "../../(components)/BoardColumns";
import {
    type BoardSection,
    BoardSectionNav,
} from "../../(components)/BoardSectionNav";
import { BoardSummaryLine } from "../../(components)/BoardSummaryLine";
import { BoardSyncButton } from "../../(components)/BoardSyncButton";
import { BoardSyncSkipped } from "../../(components)/BoardSyncSkipped";
import { boardColumnTitle } from "../../(components)/boardColumnTitle";
import {
    type BoardsDictionary,
    fillMessage,
} from "../../(components)/boardConfigIssueMessage";
import type { MoveDestination } from "../../(components)/CardMoveMenu";
import {
    type CardRunCommand,
    CardRunControls,
} from "../../(components)/CardRunControls";
import {
    type GroupedBoard,
    groupCardsByColumn,
} from "../../(components)/groupCardsByColumn";
import { countRuns } from "../../(components)/hasActiveRun";
import { NotReadyCards } from "../../(components)/NotReadyCards";
import { useStageRunDialogs } from "../../(components)/useStageRunDialogs";
import { useBoardCardCrud } from "../../(hooks)/useBoardCardCrud";
import { useFindBoardById } from "../../(hooks)/useFindBoardById";
import { useListBoardCards } from "../../(hooks)/useListBoardCards";

type BoardScreenProps = {
    board: BoardViewDTO;
    grouped: GroupedBoard;
    canPrioritize: boolean;
    canTrigger: boolean;
    skipped: CardSyncSkipDTO[];
    announcement: string;
    syncButton: ReactNode;
    boardsDictionary: BoardsDictionary;
    cardHref: (slug: string) => string;
    credentialsHref: string;
    onDismissSkipped: () => void;
    onMove: (card: CardDTO, destination: MoveDestination) => void;
    onReorder: (card: CardDTO, slugs: string[], index: number) => void;
    onRunCommand: (card: CardDTO, command: CardRunCommand) => void;
};

function BoardScreen({
    board,
    grouped,
    canPrioritize,
    canTrigger,
    skipped,
    announcement,
    syncButton,
    boardsDictionary,
    cardHref,
    credentialsHref,
    onDismissSkipped,
    onMove,
    onReorder,
    onRunCommand,
}: BoardScreenProps) {
    const hasCardOnBoard = grouped.columns.some(
        (column) => column.cards.length > 0
    );

    return (
        <div className="flex w-full min-w-0 flex-col gap-6">
            <ImpersonationReadOnlyNotice />
            <p aria-live="polite" className="sr-only">
                {announcement}
            </p>
            {canTrigger && board.executor === null ? (
                <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
                    {boardsDictionary.board.noExecutor}{" "}
                    <Link
                        className="font-medium text-foreground underline underline-offset-4"
                        href={credentialsHref}
                    >
                        {boardsDictionary.board.noExecutorLink}
                    </Link>
                </p>
            ) : null}
            {skipped.length > 0 ? (
                <BoardSyncSkipped
                    boardsDictionary={boardsDictionary}
                    onDismiss={onDismissSkipped}
                    skipped={skipped}
                />
            ) : null}
            {hasCardOnBoard ? null : (
                <BoardBacklogEmpty
                    board={board}
                    boardsDictionary={boardsDictionary}
                    cardHref={cardHref}
                    notReady={grouped.notReady}
                    syncAction={syncButton}
                />
            )}
            <section aria-label={boardsDictionary.board.columnsLabel}>
                <BoardColumns
                    boardsDictionary={boardsDictionary}
                    canPrioritize={canPrioritize}
                    canTrigger={canTrigger && board.executor !== null}
                    cardHref={cardHref}
                    columns={grouped.columns}
                    onMove={onMove}
                    onReorder={onReorder}
                    renderRunControls={(card) =>
                        card.lane === "done" ? null : (
                            <CardRunControls
                                board={board}
                                boardsDictionary={boardsDictionary}
                                canTrigger={canTrigger}
                                card={card}
                                onCommand={onRunCommand}
                            />
                        )
                    }
                />
            </section>
            {hasCardOnBoard && grouped.notReady.length > 0 ? (
                <NotReadyCards
                    boardsDictionary={boardsDictionary}
                    cardHref={cardHref}
                    cards={grouped.notReady}
                    readyStatus={board.config.backlog.readyStatus}
                />
            ) : null}
        </div>
    );
}

type BoardPageHeaderProps = {
    board: BoardViewDTO | undefined;
    runs: { running: number; queued: number };
    actions: ReactNode;
    links: Record<BoardSection, string>;
    boardsDictionary: BoardsDictionary;
};

function BoardPageHeader({
    board,
    runs,
    actions,
    links,
    boardsDictionary,
}: BoardPageHeaderProps) {
    return (
        <div className="flex flex-col gap-4">
            <BoardSectionNav
                active="board"
                boardsDictionary={boardsDictionary}
                links={links}
            />
            <PageHeader
                actions={actions}
                description={
                    board ? (
                        <BoardSummaryLine
                            board={board}
                            boardsDictionary={boardsDictionary}
                            runs={runs}
                        />
                    ) : undefined
                }
                title={board?.name ?? boardsDictionary.nav.board}
            />
        </div>
    );
}

/** Writes are refused while impersonating, so the screen offers none. */
function boardPermissions(
    board: BoardViewDTO | undefined,
    isImpersonating: boolean
) {
    const role = board?.access.effectiveRole ?? null;
    return {
        canPrioritize: canPrioritizeCards(role) && !isImpersonating,
        canTrigger: canTriggerStages(role) && !isImpersonating,
    };
}

export function BoardClient() {
    const params = useParams<{ id: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const {
        data: board,
        isLoading: isBoardLoading,
        error: boardError,
    } = useFindBoardById(id);
    const {
        data: cards,
        isLoading: areCardsLoading,
        error: cardsError,
    } = useListBoardCards(id);
    const { syncMutation, reorderMutation, moveMutation } =
        useBoardCardCrud(id);
    const { isImpersonating } = useAuthRequestPanel();
    const [skipped, setSkipped] = useState<CardSyncSkipDTO[]>([]);
    const [announcement, setAnnouncement] = useState("");
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const boardCopy = boardsDictionary.board;

    const error = boardError ?? cardsError;
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isLoading = isBoardLoading || areCardsLoading;

    const { canPrioritize, canTrigger } = boardPermissions(
        board,
        isImpersonating
    );
    const { requestTrigger, onCommand, dialogs } = useStageRunDialogs({
        boardId: id,
        board,
        cards,
        boardsDictionary,
        onAnnounce: setAnnouncement,
    });
    const grouped = useMemo(
        () => (board ? groupCardsByColumn(cards, board.config) : null),
        [board, cards]
    );
    const hasCardOnBoard =
        grouped?.columns.some((column) => column.cards.length > 0) ?? false;
    const cardHref = (slug: string) => routes.boards.card(id, slug).url;

    const syncButton = canPrioritize ? (
        <BoardSyncButton
            boardsDictionary={boardsDictionary}
            isPending={syncMutation.isPending}
            onSync={() =>
                syncMutation.mutate(undefined, {
                    onSuccess: (result) => setSkipped(result.skipped),
                })
            }
        />
    ) : null;

    const moveCard = (card: CardDTO, { column, target }: MoveDestination) => {
        if (target.lane === "stage") {
            requestTrigger(card, target.stageKey, "drag");
            return;
        }
        moveMutation.mutate(
            { card, target },
            {
                onSuccess: () =>
                    setAnnouncement(
                        fillMessage(boardCopy.card.moved, {
                            title: card.title,
                            column: boardColumnTitle(column, boardsDictionary),
                        })
                    ),
            }
        );
    };

    const reorderCard = (card: CardDTO, slugs: string[], index: number) =>
        reorderMutation.mutate(slugs, {
            onSuccess: () =>
                setAnnouncement(
                    fillMessage(boardCopy.card.reordered, {
                        title: card.title,
                        position: index + 1,
                    })
                ),
        });

    return (
        <>
            <Header
                breadcrumbs={[
                    { label: routes.root.label, href: routes.root.url },
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                ]}
                page={board?.name ?? boardsDictionary.nav.board}
            />
            <Container
                header={
                    <BoardPageHeader
                        actions={hasCardOnBoard ? syncButton : null}
                        board={board}
                        boardsDictionary={boardsDictionary}
                        links={{
                            board: routes.boards.detail(id).url,
                            members: routes.boards.members(id).url,
                            credentials: routes.boards.credentials(id).url,
                            settings: routes.boards.settings(id).url,
                        }}
                        runs={countRuns(cards)}
                    />
                }
                loadError={
                    loadError ??
                    (board || isLoading ? null : boardCopy.loadError)
                }
                loading={isLoading}
            >
                {board && grouped ? (
                    <BoardScreen
                        announcement={announcement}
                        board={board}
                        boardsDictionary={boardsDictionary}
                        canPrioritize={canPrioritize}
                        canTrigger={canTrigger}
                        cardHref={cardHref}
                        credentialsHref={routes.boards.credentials(id).url}
                        grouped={grouped}
                        onDismissSkipped={() => setSkipped([])}
                        onMove={moveCard}
                        onReorder={reorderCard}
                        onRunCommand={onCommand}
                        skipped={skipped}
                        syncButton={syncButton}
                    />
                ) : null}
            </Container>
            {dialogs}
        </>
    );
}
