"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { getDictionary } from "@repo/internationalization/client";
import { canPrioritizeCards, canTriggerStages } from "@repo/kanban-contract";
import type {
    BoardViewDTO,
    CardDTO,
    CardSyncSkipDTO,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
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
import { DraftCardControls } from "../../(components)/DraftCardControls";
import {
    type GroupedBoard,
    groupCardsByColumn,
} from "../../(components)/groupCardsByColumn";
import { countRuns } from "../../(components)/hasActiveRun";
import { NewSpecDialog } from "../../(components)/NewSpecDialog";
import { NotReadyCards } from "../../(components)/NotReadyCards";
import { useStageRunDialogs } from "../../(components)/useStageRunDialogs";
import { useBoardCardCrud } from "../../(hooks)/useBoardCardCrud";
import { useFindBoardById } from "../../(hooks)/useFindBoardById";
import { useListBoardCards } from "../../(hooks)/useListBoardCards";
import { useSpecDraftCrud } from "../../(hooks)/useSpecDraftCrud";

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
    approvingSlug: string | null;
    onApproveSpec: (card: CardDTO) => void;
    /** Absent for who cannot start a spec draft. */
    onNewDraft?: () => void;
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
    approvingSlug,
    onApproveSpec,
    onNewDraft,
}: BoardScreenProps) {
    const hasCardOnBoard = grouped.columns.some(
        (column) => column.cards.length > 0
    );

    return (
        <div className="flex w-full min-w-0 flex-col gap-6">
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
                    onNewDraft={onNewDraft}
                    onReorder={onReorder}
                    renderRunControls={(card) => {
                        if (card.lane === "done") {
                            return null;
                        }
                        if (card.lane === "drafts") {
                            return (
                                <DraftCardControls
                                    boardsDictionary={boardsDictionary}
                                    canApprove={canPrioritize}
                                    card={card}
                                    href={cardHref(card.slug)}
                                    isApproving={approvingSlug === card.slug}
                                    onApprove={onApproveSpec}
                                />
                            );
                        }
                        return (
                            <CardRunControls
                                board={board}
                                boardsDictionary={boardsDictionary}
                                canTrigger={canTrigger}
                                card={card}
                                onCommand={onRunCommand}
                            />
                        );
                    }}
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

function boardPermissions(board: BoardViewDTO | undefined) {
    const role = board?.access.effectiveRole ?? null;
    return {
        canPrioritize: canPrioritizeCards(role),
        canTrigger: canTriggerStages(role),
    };
}

/** The "New spec" entry points, the dialog behind them and approving a draft from its card. */
function useSpecDrafts({
    boardId,
    board,
    canTrigger,
    boardsDictionary,
    cardHref,
}: {
    boardId: string;
    board: BoardViewDTO | undefined;
    canTrigger: boolean;
    boardsDictionary: BoardsDictionary;
    cardHref: (slug: string) => string;
}) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const { approveSpecMutation } = useSpecDraftCrud(boardId);
    const open = canTrigger ? () => setIsOpen(true) : undefined;

    return {
        open,
        button: open ? (
            <Button onClick={open} type="button" variant="outline">
                <PlusIcon aria-hidden />
                {boardsDictionary.drafts.newSpec.open}
            </Button>
        ) : null,
        dialog:
            board && canTrigger ? (
                <NewSpecDialog
                    board={board}
                    boardsDictionary={boardsDictionary}
                    onCreated={(slug) => {
                        setIsOpen(false);
                        router.push(cardHref(slug));
                    }}
                    onOpenChange={setIsOpen}
                    open={isOpen}
                />
            ) : null,
        approvingSlug: approveSpecMutation.isPending
            ? (approveSpecMutation.variables?.slug ?? null)
            : null,
        approve: (card: CardDTO) => approveSpecMutation.mutate(card),
    };
}

function headerActions(
    newSpecButton: ReactNode,
    syncButton: ReactNode,
    hasCardOnBoard: boolean
): ReactNode {
    const sync = hasCardOnBoard ? syncButton : null;
    if (!(newSpecButton || sync)) {
        return null;
    }
    return (
        <div className="flex flex-wrap gap-2">
            {newSpecButton}
            {sync}
        </div>
    );
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

    const { canPrioritize, canTrigger } = boardPermissions(board);
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
    const specDrafts = useSpecDrafts({
        boardId: id,
        board,
        canTrigger,
        boardsDictionary,
        cardHref,
    });

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
                        actions={headerActions(
                            specDrafts.button,
                            syncButton,
                            hasCardOnBoard
                        )}
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
                        approvingSlug={specDrafts.approvingSlug}
                        board={board}
                        boardsDictionary={boardsDictionary}
                        canPrioritize={canPrioritize}
                        canTrigger={canTrigger}
                        cardHref={cardHref}
                        credentialsHref={routes.boards.credentials(id).url}
                        grouped={grouped}
                        onApproveSpec={specDrafts.approve}
                        onDismissSkipped={() => setSkipped([])}
                        onMove={moveCard}
                        onNewDraft={specDrafts.open}
                        onReorder={reorderCard}
                        onRunCommand={onCommand}
                        skipped={skipped}
                        syncButton={syncButton}
                    />
                ) : null}
            </Container>
            {dialogs}
            {specDrafts.dialog}
        </>
    );
}
