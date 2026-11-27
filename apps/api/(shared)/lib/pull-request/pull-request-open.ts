import {
    type BoardConfig,
    type CardPullRequest,
    findPullRequestStage,
    type RunPerson,
} from "@repo/kanban-contract";
import type { BoardDTO, CardEventDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import {
    type GithubClient,
    type GithubPullRequest,
    type GithubPullRequestInput,
    type GithubRepositoryRef,
    getGithubClient,
} from "@/(shared)/lib/github/github-client";
import {
    GithubApiError,
    githubErrorCode,
} from "@/(shared)/lib/github/github-errors";
import type { CardRecord } from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { env } from "@/env";
import { appendBoardUpdate, pullRequestEventText } from "./pull-request-events";

type Board = Pick<BoardDTO, "id" | "config" | "repository">;

export type EnsurePullRequestResult =
    | { ok: true; card: CardRecord }
    | { ok: false; code: string; status: number };

// GitHub refuses a pull request body above 65,536 characters.
const MAX_BODY_LENGTH = 60_000;
const TRUNCATED_MARK = "\n\n…";
const TRAILING_SLASH = /\/$/;

/**
 * The pull request body: the last report of each stage before the pull request stage, in
 * the board's order, and a link back to the card when the app URL is known.
 */
export function buildPullRequestBody(input: {
    config: BoardConfig;
    stageKey: string;
    events: CardEventDTO[];
    cardUrl: string | null;
}): string {
    const sections: string[] = [];
    for (const stage of input.config.stages) {
        if (stage.key === input.stageKey) {
            break;
        }
        const report = input.events
            .filter(
                (event) =>
                    event.type === "report" && event.stageKey === stage.key
            )
            .at(-1);
        if (report?.type === "report") {
            sections.push(`## ${stage.column}\n\n${report.markdown.trim()}`);
        }
    }
    const footer =
        input.cardUrl === null ? "" : `\n\n---\n\nCard: ${input.cardUrl}`;
    const body = sections.join("\n\n");
    const room = MAX_BODY_LENGTH - footer.length;
    const fitted =
        body.length > room
            ? `${body.slice(0, room - TRUNCATED_MARK.length)}${TRUNCATED_MARK}`
            : body;
    return `${fitted}${footer}`;
}

function cardUrlOf(card: Pick<CardRecord, "boardId" | "slug">): string | null {
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
        return null;
    }
    return `${appUrl.replace(TRAILING_SLASH, "")}/boards/${encodeURIComponent(card.boardId)}/cards/${encodeURIComponent(card.slug)}`;
}

type Opened = {
    pullRequest: GithubPullRequest;
    openedByBoard: boolean;
    draftRefused: boolean;
};

const isUnprocessable = (error: unknown): boolean =>
    error instanceof GithubApiError && error.kind === "unprocessable";

/**
 * A 422 has two common causes the board can recover from: a pull request already open for
 * the branch (adopted as it is), and a private repository on GitHub's Free plan, which does
 * not accept drafts (opened ready for review instead). Anything else is the caller's error.
 */
async function openOrAdopt(
    client: GithubClient,
    repo: GithubRepositoryRef,
    input: GithubPullRequestInput
): Promise<Opened> {
    try {
        const pullRequest = await client.createPullRequest(repo, input);
        return { pullRequest, openedByBoard: true, draftRefused: false };
    } catch (error) {
        if (!isUnprocessable(error)) {
            throw error;
        }
        const existing = await client.findOpenPullRequest(repo, input.head);
        if (existing !== null) {
            return {
                pullRequest: existing,
                openedByBoard: false,
                draftRefused: false,
            };
        }
        if (!input.draft) {
            throw error;
        }
        const pullRequest = await client.createPullRequest(repo, {
            ...input,
            draft: false,
        });
        return { pullRequest, openedByBoard: true, draftRefused: true };
    }
}

function toCardPullRequest(
    opened: Opened,
    dispatchAs: RunPerson,
    now: Date
): CardPullRequest {
    const { pullRequest } = opened;
    return {
        number: pullRequest.number,
        url: pullRequest.url,
        title: pullRequest.title,
        draft: pullRequest.draft,
        state: "open",
        headRef: pullRequest.headRef,
        baseRef: pullRequest.baseRef,
        headSha: pullRequest.headSha,
        commits: pullRequest.commits,
        openedAt: now.toISOString(),
        openedByBoard: opened.openedByBoard,
        dispatchAs,
        closedAt: null,
        closedByLogin: null,
        checks: [],
        reviews: [],
        commentRunsAt: [],
        unhandledCommentAt: null,
    };
}

function failureOf(error: unknown): { code: string; status: number } {
    if (error instanceof GithubApiError) {
        return githubErrorCode(error);
    }
    return { code: "GITHUB_UNAVAILABLE", status: HTTP_STATUS.BAD_GATEWAY };
}

async function recordFailure(
    card: CardRecord,
    failure: { code: string; status: number },
    now: Date
): Promise<EnsurePullRequestResult> {
    // Only a card without an open pull request gets here; a closed one from an earlier pass
    // would make the next run end settle the card as if this attempt had been closed.
    await cardRepository.updatePullRequest(card.id, () => ({
        pullRequest: null,
        pullRequestError: { code: failure.code, at: now },
    }));
    await appendBoardUpdate(card, pullRequestEventText.failed(failure.code));
    return { ok: false, ...failure };
}

function openedText(opened: Opened): string {
    const { number, draft } = opened.pullRequest;
    if (!opened.openedByBoard) {
        return pullRequestEventText.adopted(number);
    }
    return opened.draftRefused
        ? pullRequestEventText.openedNotDraft(number)
        : pullRequestEventText.opened(number, draft);
}

/**
 * Opens, or adopts, the pull request of a card that sits on the pull request stage. A card
 * that already has an open one is returned as it is. A GitHub failure is written on the card
 * (`pullRequestError`) and returned, never thrown: the automatic call runs inside another
 * agent's `complete_stage`, which must not fail because of it.
 */
export async function ensurePullRequest(input: {
    board: Board;
    cardId: string;
    dispatchAs: RunPerson;
    now?: Date;
}): Promise<EnsurePullRequestResult> {
    const now = input.now ?? new Date();
    const { board } = input;
    const card = await cardRepository.findById(input.cardId);
    if (card === null || card.boardId !== board.id) {
        return {
            ok: false,
            code: "CARD_NOT_FOUND",
            status: HTTP_STATUS.NOT_FOUND,
        };
    }
    const stage = findPullRequestStage(board.config);
    if (
        stage === undefined ||
        card.lane !== "stage" ||
        card.stageKey !== stage.key
    ) {
        return {
            ok: false,
            code: "CARD_NOT_IN_PULL_REQUEST_STAGE",
            status: HTTP_STATUS.CONFLICT,
        };
    }
    if (card.pullRequest?.state === "open") {
        return { ok: true, card };
    }
    if (card.branch === null) {
        return {
            ok: false,
            code: "CARD_BRANCH_INVALID",
            status: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        };
    }

    const client = getGithubClient();
    if (client === null) {
        return recordFailure(
            card,
            {
                code: "GITHUB_APP_NOT_CONFIGURED",
                status: HTTP_STATUS.SERVICE_UNAVAILABLE,
            },
            now
        );
    }

    let opened: Opened;
    try {
        const events = await cardEventRepository.listByCard(card.id);
        opened = await openOrAdopt(
            client,
            {
                installationId: board.repository.installationId,
                owner: board.repository.owner,
                name: board.repository.name,
            },
            {
                head: card.branch,
                base: board.config.baseBranch,
                title: card.title,
                body: buildPullRequestBody({
                    config: board.config,
                    stageKey: stage.key,
                    events,
                    cardUrl: cardUrlOf(card),
                }),
                draft: stage.pullRequest?.draft ?? true,
            }
        );
    } catch (error) {
        const failure = failureOf(error);
        logEvent("github", "pull-request-open-failed", {
            boardId: board.id,
            cardId: card.id,
            code: failure.code,
        });
        return recordFailure(card, failure, now);
    }

    const pullRequest = toCardPullRequest(opened, input.dispatchAs, now);
    const stored = await cardRepository.updatePullRequest(card.id, () => ({
        pullRequest,
        pullRequestError: null,
    }));
    await appendBoardUpdate(card, openedText(opened));
    return stored === null
        ? { ok: false, code: "CARD_NOT_FOUND", status: HTTP_STATUS.NOT_FOUND }
        : { ok: true, card: stored };
}
