"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { getDictionary } from "@repo/internationalization/client";
import {
    canPrioritizeCards,
    canTriggerStages,
    draftStatus,
    SPEC_STAGE_KEY,
} from "@repo/kanban-contract";
import type { BoardViewDTO, CardDTO } from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { LoadErrorState } from "@/shared/components/ui/LoadErrorState";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useAuthRequestPanel } from "@/shared/providers/AuthRequestPanelContext";
import { useFindCardSpecBySlug } from "../(hooks)/useFindCardSpecBySlug";
import { useListCardEvents } from "../(hooks)/useListCardEvents";
import { useSpecDraftCrud } from "../(hooks)/useSpecDraftCrud";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { type CardRunCommand, CardRunControls } from "./CardRunControls";
import { DraftAttachmentList } from "./DraftAttachmentList";
import { draftStatusBadge } from "./draftCardStatus";
import { ApproveSpecButton, DiscardDraftButton } from "./SpecDraftActions";
import { SpecMarkdown } from "./SpecMarkdown";

type SpecDraftDetailProps = {
    board: BoardViewDTO;
    card: CardDTO;
    boardsDictionary: BoardsDictionary;
    /** Questions and timeline of the card, rendered by the page. */
    activity: ReactNode;
    onRunCommand: (card: CardDTO, command: CardRunCommand) => void;
    onDiscarded: () => void;
};

/** The agent pushes a new draft at the end of each round, which is when the card changes. */
function useRefetchDraftWhenCardChanges(boardId: string, card: CardDTO) {
    const queryClient = useQueryClient();
    const seenVersion = useRef(card.updatedAt);
    useEffect(() => {
        if (seenVersion.current === card.updatedAt) {
            return;
        }
        seenVersion.current = card.updatedAt;
        queryClient.invalidateQueries({
            queryKey: queryKeys.boards.cardSpec(boardId, card.slug),
        });
    }, [boardId, card.slug, card.updatedAt, queryClient]);
}

function DraftSpecPanel({
    board,
    card,
    boardsDictionary,
    actions,
}: {
    board: BoardViewDTO;
    card: CardDTO;
    boardsDictionary: BoardsDictionary;
    actions: ReactNode;
}) {
    const { locale } = getDictionary();
    const detailCopy = boardsDictionary.drafts.detail;
    const {
        data: spec,
        isLoading,
        error,
    } = useFindCardSpecBySlug(board.id, card.slug);
    useRefetchDraftWhenCardChanges(board.id, card);

    let body: ReactNode;
    if (isLoading) {
        body = (
            <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
            </div>
        );
    } else if (error) {
        body = (
            <LoadErrorState
                message={handleClientError(new FormattedError(error, locale))}
            />
        );
    } else if (spec?.content == null) {
        body = (
            <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                {fillMessage(detailCopy.draftMissing, {
                    branch: card.branch ?? "",
                })}
            </p>
        );
    } else {
        body = (
            <SpecMarkdown
                content={spec.content}
                links={{
                    owner: board.repository.owner,
                    name: board.repository.name,
                    ref: spec.ref,
                    documentPath: spec.path,
                }}
            />
        );
    }

    return (
        <Card className="gap-4 p-5">
            <div className="flex flex-col gap-0.5">
                <h2 className="font-semibold text-sm">
                    {detailCopy.draftTitle}
                </h2>
                <span className="break-all font-mono text-muted-foreground text-xs">
                    {card.spec.path}
                </span>
            </div>
            {body}
            {actions}
        </Card>
    );
}

function RequestPanel({
    card,
    boardsDictionary,
}: {
    card: CardDTO;
    boardsDictionary: BoardsDictionary;
}) {
    const { locale } = getDictionary();
    const detailCopy = boardsDictionary.drafts.detail;
    const request = card.request;
    if (request === null) {
        return null;
    }
    return (
        <Card className="gap-3 p-5">
            <h2 className="font-semibold text-sm">{detailCopy.request}</h2>
            <p className="whitespace-pre-wrap break-words text-sm">
                {request.text}
            </p>
            {request.attachments.length > 0 ? (
                <div className="flex flex-col gap-2">
                    <h3 className="text-muted-foreground text-xs">
                        {detailCopy.attachments}
                    </h3>
                    <DraftAttachmentList
                        boardsDictionary={boardsDictionary}
                        items={request.attachments.map((attachment) => ({
                            key: attachment.id,
                            name: attachment.name,
                            size: attachment.size,
                            contentType: attachment.contentType,
                        }))}
                        locale={locale}
                    />
                </div>
            ) : null}
        </Card>
    );
}

/**
 * The page of a card in Drafts: the request and the questions on one side, the draft as
 * the agent last pushed it on the other, with approve and discard.
 */
export function SpecDraftDetail({
    board,
    card,
    boardsDictionary,
    activity,
    onRunCommand,
    onDiscarded,
}: SpecDraftDetailProps) {
    const { isImpersonating } = useAuthRequestPanel();
    const formatDateTime = useFormatDisplayDateTime();
    const detailCopy = boardsDictionary.drafts.detail;
    const role = board.access.effectiveRole;
    const canTrigger = canTriggerStages(role) && !isImpersonating;
    const canDecide = canPrioritizeCards(role) && !isImpersonating;
    const { approveSpecMutation, discardDraftMutation } = useSpecDraftCrud(
        board.id
    );
    const { data: events } = useListCardEvents(board.id, card.slug);
    const rounds = events.filter(
        (event) =>
            event.type === "question" && event.stageKey === SPEC_STAGE_KEY
    ).length;
    const badge = draftStatusBadge(draftStatus(card), boardsDictionary);

    return (
        <div className="flex w-full min-w-0 flex-col gap-6">
            <Card className="gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-muted-foreground">
                        {detailCopy.inDrafts}
                        {rounds > 0
                            ? ` · ${fillMessage(detailCopy.round, { round: rounds })}`
                            : null}
                    </span>
                </div>
                {card.branch ? (
                    <span className="break-all font-mono text-muted-foreground text-xs">
                        {card.branch}
                    </span>
                ) : null}
                {card.request ? (
                    <span className="text-muted-foreground text-xs">
                        {fillMessage(detailCopy.requestedBy, {
                            login: card.request.requestedBy.login,
                            date: formatDateTime(card.request.requestedAt),
                        })}
                    </span>
                ) : null}
                <CardRunControls
                    board={board}
                    boardsDictionary={boardsDictionary}
                    canTrigger={canTrigger}
                    card={card}
                    onCommand={onRunCommand}
                    showOrphan={false}
                    showState={false}
                />
                {canDecide ? (
                    <div>
                        <DiscardDraftButton
                            boardsDictionary={boardsDictionary}
                            card={card}
                            isPending={discardDraftMutation.isPending}
                            onDiscard={async (target) => {
                                await discardDraftMutation.mutateAsync(target);
                                onDiscarded();
                            }}
                        />
                    </div>
                ) : null}
            </Card>
            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-6">
                    <RequestPanel
                        boardsDictionary={boardsDictionary}
                        card={card}
                    />
                    {activity}
                </div>
                <div className="min-w-0">
                    <DraftSpecPanel
                        actions={
                            canDecide ? (
                                <ApproveSpecButton
                                    boardsDictionary={boardsDictionary}
                                    card={card}
                                    isPending={approveSpecMutation.isPending}
                                    onApprove={(target) =>
                                        approveSpecMutation.mutate(target)
                                    }
                                />
                            ) : null
                        }
                        board={board}
                        boardsDictionary={boardsDictionary}
                        card={card}
                    />
                </div>
            </div>
        </div>
    );
}
