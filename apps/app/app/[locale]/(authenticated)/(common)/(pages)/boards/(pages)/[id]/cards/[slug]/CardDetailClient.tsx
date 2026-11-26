"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { getDictionary } from "@repo/internationalization/client";
import {
    canAnswerQuestions,
    canCommentOnCards,
    canTriggerStages,
} from "@repo/kanban-contract";
import type {
    BoardViewDTO,
    CardDTO,
    CardEventViewDTO,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { LoadErrorState } from "@/shared/components/ui/LoadErrorState";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useAuthRequestPanel } from "@/shared/providers/AuthRequestPanelContext";
import { COMMON_ROUTES } from "../../../../../../paths";
import { boardColumnTitle } from "../../../../(components)/boardColumnTitle";
import {
    type BoardsDictionary,
    fillMessage,
} from "../../../../(components)/boardConfigIssueMessage";
import { CardArtifacts } from "../../../../(components)/CardArtifacts";
import { CardQuestions } from "../../../../(components)/CardQuestions";
import {
    type CardRunCommand,
    CardRunControls,
} from "../../../../(components)/CardRunControls";
import { CardTimeline } from "../../../../(components)/CardTimeline";
import { githubFileUrl } from "../../../../(components)/githubFileUrl";
import { groupCardsByColumn } from "../../../../(components)/groupCardsByColumn";
import { SpecMarkdown } from "../../../../(components)/SpecMarkdown";
import { shortSha } from "../../../../(components)/shortSha";
import { useStageRunDialogs } from "../../../../(components)/useStageRunDialogs";
import { useCardEventCrud } from "../../../../(hooks)/useCardEventCrud";
import { useFindBoardById } from "../../../../(hooks)/useFindBoardById";
import { useFindBoardCardBySlug } from "../../../../(hooks)/useFindBoardCardBySlug";
import { useFindCardSpecBySlug } from "../../../../(hooks)/useFindCardSpecBySlug";
import { useListCardEvents } from "../../../../(hooks)/useListCardEvents";

type CardSectionProps = {
    board: BoardViewDTO;
    card: CardDTO;
    boardsDictionary: BoardsDictionary;
};

function columnTitleOf(
    board: BoardViewDTO,
    card: CardDTO,
    boardsDictionary: BoardsDictionary
): string {
    const { columns } = groupCardsByColumn([card], board.config);
    const column = columns.find((grouped) => grouped.cards.length > 0)?.column;
    return column
        ? boardColumnTitle(column, boardsDictionary)
        : boardsDictionary.board.notReady.title;
}

function CardSummary({
    board,
    card,
    boardsDictionary,
    onRunCommand,
}: CardSectionProps & {
    onRunCommand: (card: CardDTO, command: CardRunCommand) => void;
}) {
    const { isImpersonating } = useAuthRequestPanel();
    const detailCopy = boardsDictionary.cardDetail;
    const specUrl = githubFileUrl(
        board.repository.owner,
        board.repository.name,
        board.config.baseBranch,
        card.spec.path
    );

    return (
        <Card className="p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
                <dt className="text-muted-foreground">{detailCopy.column}</dt>
                <dd className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline">
                        {columnTitleOf(board, card, boardsDictionary)}
                    </Badge>
                    {card.orphan ? (
                        <Badge variant="outline">
                            {boardsDictionary.board.card.orphan}
                        </Badge>
                    ) : null}
                </dd>
                <dt className="text-muted-foreground">{detailCopy.state}</dt>
                <dd>
                    <CardRunControls
                        board={board}
                        boardsDictionary={boardsDictionary}
                        canTrigger={
                            canTriggerStages(board.access.effectiveRole) &&
                            !isImpersonating
                        }
                        card={card}
                        onCommand={onRunCommand}
                        showOrphan={false}
                    />
                </dd>
                <dt className="text-muted-foreground">{detailCopy.branch}</dt>
                <dd className="break-all font-mono">
                    {card.branch ?? boardsDictionary.wizard.rules.none}
                </dd>
                <dt className="text-muted-foreground">{detailCopy.spec}</dt>
                <dd className="flex min-w-0 flex-col gap-0.5">
                    <a
                        className="break-all font-mono text-primary underline-offset-4 hover:underline"
                        href={specUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                    >
                        {card.spec.path}
                    </a>
                    {card.orphan ? null : (
                        <span className="text-muted-foreground text-xs">
                            {card.spec.status}
                        </span>
                    )}
                </dd>
            </dl>
        </Card>
    );
}

function SpecSection({ board, card, boardsDictionary }: CardSectionProps) {
    const { locale } = getDictionary();
    const detailCopy = boardsDictionary.cardDetail;
    const {
        data: spec,
        isLoading,
        error,
    } = useFindCardSpecBySlug(board.id, card.slug);

    if (isLoading) {
        return (
            <Card className="gap-3 p-5">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
            </Card>
        );
    }
    if (error || !spec) {
        return (
            <LoadErrorState
                message={
                    error
                        ? handleClientError(new FormattedError(error, locale))
                        : detailCopy.specLoadError
                }
            />
        );
    }
    if (spec.content === null) {
        return (
            <Empty className="border border-border border-dashed">
                <EmptyHeader>
                    <EmptyTitle>{detailCopy.specMissing}</EmptyTitle>
                    <EmptyDescription>
                        {fillMessage(detailCopy.specMissingHint, {
                            path: spec.path,
                            ref: spec.ref,
                        })}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <Card className="gap-4 p-5">
            <span className="font-mono text-muted-foreground text-xs">
                {spec.path}{" "}
                {fillMessage(detailCopy.specAt, {
                    ref: spec.ref,
                    sha: shortSha(spec.sha ?? ""),
                })}
            </span>
            <SpecMarkdown
                content={spec.content}
                links={{
                    owner: board.repository.owner,
                    name: board.repository.name,
                    ref: spec.ref,
                    documentPath: spec.path,
                }}
            />
        </Card>
    );
}

function pendingQuestionsOf(card: CardDTO, events: CardEventViewDTO[]) {
    const pending = card.pendingAsk;
    if (pending === null) {
        return null;
    }
    const event = events.find((candidate) => candidate.id === pending.eventId);
    return event?.type === "question" ? event : null;
}

/**
 * A run writes its report and questions while the card is polled, so a card that changed
 * on the server has events this page has not read yet.
 */
function useRefetchEventsWhenCardChanges(boardId: string, card: CardDTO) {
    const queryClient = useQueryClient();
    const seenVersion = useRef(card.updatedAt);
    useEffect(() => {
        if (seenVersion.current === card.updatedAt) {
            return;
        }
        seenVersion.current = card.updatedAt;
        queryClient.invalidateQueries({
            queryKey: queryKeys.boards.cardEvents(boardId, card.slug),
        });
    }, [boardId, card.slug, card.updatedAt, queryClient]);
}

/** Pending questions on top, then the timeline, the spec and the artifacts as tabs. */
function CardActivity({ board, card, boardsDictionary }: CardSectionProps) {
    const { locale } = getDictionary();
    const { isImpersonating } = useAuthRequestPanel();
    const detailCopy = boardsDictionary.cardDetail;
    const {
        data: events,
        isLoading,
        error,
    } = useListCardEvents(board.id, card.slug);
    useRefetchEventsWhenCardChanges(board.id, card);
    const {
        commentMutation,
        editCommentMutation,
        deleteCommentMutation,
        answerMutation,
    } = useCardEventCrud(board.id, card.slug);

    const role = board.access.effectiveRole;
    const canComment = canCommentOnCards(role) && !isImpersonating;
    const canAnswer = canAnswerQuestions(role) && !isImpersonating;
    const pendingQuestions = pendingQuestionsOf(card, events);
    const links = {
        owner: board.repository.owner,
        name: board.repository.name,
        ref: card.branch ?? board.config.baseBranch,
        documentPath: "",
    };
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;

    return (
        <>
            {pendingQuestions && card.pendingAsk ? (
                <CardQuestions
                    boardsDictionary={boardsDictionary}
                    canAnswer={canAnswer}
                    config={board.config}
                    isSubmitting={answerMutation.isPending}
                    key={pendingQuestions.id}
                    onAnswer={(answers) =>
                        answerMutation.mutateAsync({
                            questionEventId: pendingQuestions.id,
                            answers,
                        })
                    }
                    questions={pendingQuestions.questions}
                    resumes={board.executor !== null}
                    stageKey={card.pendingAsk.stageKey}
                />
            ) : null}
            <Tabs className="min-w-0" defaultValue="timeline">
                <TabsList aria-label={detailCopy.tabs.label}>
                    <TabsTrigger className="flex-none" value="timeline">
                        {detailCopy.tabs.timeline}
                    </TabsTrigger>
                    <TabsTrigger className="flex-none" value="spec">
                        {detailCopy.tabs.spec}
                    </TabsTrigger>
                    <TabsTrigger className="flex-none" value="artifacts">
                        {detailCopy.tabs.artifacts}
                    </TabsTrigger>
                </TabsList>
                <TabsContent className="pt-4" value="timeline">
                    <CardTimeline
                        actions={{
                            canEditComments: canComment,
                            onEditComment: (eventId, markdown) =>
                                editCommentMutation.mutateAsync({
                                    eventId,
                                    markdown,
                                }),
                            onDeleteComment: (eventId) =>
                                deleteCommentMutation.mutate(eventId),
                        }}
                        boardsDictionary={boardsDictionary}
                        canComment={canComment}
                        config={board.config}
                        events={events}
                        isLoading={isLoading}
                        links={links}
                        loadError={loadError}
                        onComment={(markdown) =>
                            commentMutation.mutateAsync({ markdown })
                        }
                        pendingEventId={card.pendingAsk?.eventId ?? null}
                    />
                </TabsContent>
                <TabsContent className="pt-4" value="spec">
                    <SpecSection
                        board={board}
                        boardsDictionary={boardsDictionary}
                        card={card}
                    />
                </TabsContent>
                <TabsContent className="pt-4" value="artifacts">
                    <CardArtifacts
                        boardsDictionary={boardsDictionary}
                        config={board.config}
                        events={events}
                        name={board.repository.name}
                        owner={board.repository.owner}
                    />
                </TabsContent>
            </Tabs>
            {pendingQuestions && canAnswer ? (
                <div aria-hidden className="h-16 md:hidden" />
            ) : null}
        </>
    );
}

export function CardDetailClient() {
    const params = useParams<{ id: string; slug: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const slug = typeof params.slug === "string" ? params.slug : "";
    const {
        data: board,
        isLoading: isBoardLoading,
        error: boardError,
    } = useFindBoardById(id);
    const {
        data: card,
        isLoading: isCardLoading,
        error: cardError,
    } = useFindBoardCardBySlug(id, slug);
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const detailCopy = boardsDictionary.cardDetail;

    const error = boardError ?? cardError;
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isLoading = isBoardLoading || isCardLoading;
    const title = card?.title ?? routes.boards.card(id, slug).label;
    const queryClient = useQueryClient();
    const boardCards =
        queryClient.getQueryData<CardDTO[]>(queryKeys.boards.cards(id)) ??
        (card ? [card] : []);
    const { onCommand, dialogs } = useStageRunDialogs({
        boardId: id,
        board,
        cards: boardCards,
        boardsDictionary,
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
                    {
                        label: board?.name ?? routes.boards.detail(id).label,
                        href: routes.boards.detail(id).url,
                    },
                ]}
                page={title}
            />
            <Container
                header={<PageHeader title={title} />}
                loadError={
                    loadError ??
                    (isLoading || (board && card) ? null : detailCopy.loadError)
                }
                loading={isLoading}
            >
                {board && card ? (
                    <div className="flex w-full min-w-0 flex-col gap-6">
                        <CardSummary
                            board={board}
                            boardsDictionary={boardsDictionary}
                            card={card}
                            onRunCommand={onCommand}
                        />
                        <CardActivity
                            board={board}
                            boardsDictionary={boardsDictionary}
                            card={card}
                        />
                    </div>
                ) : null}
            </Container>
            {dialogs}
        </>
    );
}
