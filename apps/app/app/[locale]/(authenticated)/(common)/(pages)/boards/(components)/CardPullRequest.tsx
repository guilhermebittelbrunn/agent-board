"use client";

import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { getDictionary } from "@repo/internationalization/client";
import { canTriggerStages, findPullRequestStage } from "@repo/kanban-contract";
import type {
    BoardViewDTO,
    CardDTO,
    CardPullRequestDTO,
} from "@repo/sdk/src/types";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { useBoardCardCrud } from "../(hooks)/useBoardCardCrud";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type CardPullRequestProps = {
    board: BoardViewDTO;
    card: CardDTO;
    boardsDictionary: BoardsDictionary;
};

type PullRequestCopy = BoardsDictionary["cardDetail"]["pullRequest"];

const STATE_VARIANT = {
    open: "secondary",
    merged: "default",
    closed: "outline",
} as const;

function conclusionText(conclusion: string, copy: PullRequestCopy): string {
    const known = copy.checks.conclusion as Record<string, string>;
    return (
        known[conclusion] ??
        fillMessage(copy.checks.conclusion.other, { conclusion })
    );
}

function PullRequestDetails({
    pullRequest,
    copy,
    pendingCommand,
}: {
    pullRequest: CardPullRequestDTO;
    copy: PullRequestCopy;
    pendingCommand: string | null;
}) {
    const formatDateTime = useFormatDisplayDateTime();
    const openedCopy = pullRequest.openedByBoard
        ? copy.openedByBoard
        : copy.adoptedByBoard;
    const meta = [
        fillMessage(copy.branches, {
            head: pullRequest.headRef,
            base: pullRequest.baseRef,
        }),
        pullRequest.commits === null
            ? null
            : fillMessage(
                  pullRequest.commits === 1
                      ? copy.commitsOne
                      : copy.commitsOther,
                  { count: pullRequest.commits }
              ),
        fillMessage(openedCopy, {
            when: formatDateTime(pullRequest.openedAt),
        }),
    ].filter((part): part is string => part !== null);
    const closedLine =
        pullRequest.closedByLogin === null
            ? null
            : fillMessage(
                  pullRequest.state === "merged"
                      ? copy.mergedBy
                      : copy.closedBy,
                  { login: pullRequest.closedByLogin }
              );

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <a
                    className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                    href={pullRequest.url}
                    rel="noreferrer noopener"
                    target="_blank"
                    title={copy.openOnGithub}
                >
                    #{pullRequest.number} {pullRequest.title}
                </a>
                {pullRequest.draft && pullRequest.state === "open" ? (
                    <Badge variant="outline">{copy.draft}</Badge>
                ) : null}
                <Badge variant={STATE_VARIANT[pullRequest.state]}>
                    {copy.states[pullRequest.state]}
                </Badge>
            </div>
            <p className="break-words font-mono text-muted-foreground text-xs">
                {meta.join(" · ")}
            </p>
            {closedLine === null ? null : (
                <p className="text-muted-foreground text-sm">{closedLine}</p>
            )}
            {pendingCommand === null ? null : (
                <output className="block text-primary text-sm">
                    {fillMessage(copy.pendingComment, {
                        command: pendingCommand,
                    })}
                </output>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <section className="flex flex-col gap-2">
                    <h3 className="font-medium text-sm">
                        {copy.checks.title}
                        {pullRequest.checks.length > 0 ? (
                            <span className="ml-2 font-normal text-muted-foreground">
                                {copy.checks.summary[pullRequest.checksSummary]}
                            </span>
                        ) : null}
                    </h3>
                    {pullRequest.checks.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            {copy.checks.empty}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1 text-sm">
                            {pullRequest.checks.map((check) => (
                                <li
                                    className="flex flex-wrap justify-between gap-2"
                                    key={check.app}
                                >
                                    <span className="min-w-0 break-words">
                                        {check.name}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {conclusionText(check.conclusion, copy)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                <section className="flex flex-col gap-2">
                    <h3 className="font-medium text-sm">
                        {copy.reviews.title}
                    </h3>
                    {pullRequest.reviews.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            {copy.reviews.empty}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1 text-sm">
                            {pullRequest.reviews.map((review) => (
                                <li
                                    className="flex flex-wrap justify-between gap-2"
                                    key={review.login}
                                >
                                    <span className="min-w-0 break-all font-mono">
                                        @{review.login}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {copy.reviews.state[review.state]}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </>
    );
}

/** The card's pull request: link, CI and reviews, or why the board could not open it. */
export function CardPullRequest({
    board,
    card,
    boardsDictionary,
}: CardPullRequestProps) {
    const { dictionary } = getDictionary();
    const { openPullRequestMutation } = useBoardCardCrud(board.id);
    const copy = boardsDictionary.cardDetail.pullRequest;
    const { pullRequest, pullRequestError } = card;
    const utilsCopy = dictionary.packages.utils;
    const errorText = (code: string) =>
        (utilsCopy.apiErrors as Record<string, string>)[code] ??
        utilsCopy.error.unexpected;
    const onPullRequestStage =
        card.lane === "stage" &&
        card.stageKey === findPullRequestStage(board.config)?.key;
    const showError =
        pullRequestError !== null &&
        pullRequest?.state !== "open" &&
        onPullRequestStage;
    const canRetry = showError && canTriggerStages(board.access.effectiveRole);
    if (pullRequest === null && !showError) {
        return null;
    }
    const pendingCommand =
        pullRequest?.pendingComment === true
            ? (findPullRequestStage(board.config)?.onPrComment ?? null)
            : null;

    return (
        <Card className="gap-4 p-5" data-testid="card-pull-request">
            <h2 className="font-semibold text-base">{copy.title}</h2>
            {showError ? (
                <Alert variant="destructive">
                    <AlertTitle>{copy.errorTitle}</AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-3">
                        <span>{errorText(pullRequestError.code)}</span>
                        {canRetry ? (
                            <Button
                                disabled={openPullRequestMutation.isPending}
                                onClick={() =>
                                    openPullRequestMutation.mutate(card)
                                }
                                size="sm"
                                variant="outline"
                            >
                                {openPullRequestMutation.isPending
                                    ? copy.retrying
                                    : copy.retry}
                            </Button>
                        ) : null}
                    </AlertDescription>
                </Alert>
            ) : null}
            {pullRequest === null ? null : (
                <PullRequestDetails
                    copy={copy}
                    pendingCommand={pendingCommand}
                    pullRequest={pullRequest}
                />
            )}
            {pullRequest?.state === "open" ? (
                <p className="text-muted-foreground text-xs">
                    {copy.mergeNote}
                </p>
            ) : null}
        </Card>
    );
}
