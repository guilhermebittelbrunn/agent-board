import type { StageConfig } from "./boardConfig";
import type { CardLane } from "./boardLanes";
import type { CardPendingAsk, ResolvedAnswer } from "./cardEvent";
import type { CardState } from "./cardState";
import type { PullRequestState } from "./pullRequest";
import type { AttachmentType } from "./specAuthoring";

/** A person's answers to one `ask`, paired with the question event they close. */
export type AgentAnsweredQuestion = {
    questionEventId: string;
    stageKey: string | null;
    answeredAt: string;
    answers: ResolvedAnswer[];
};

export type AgentArtifactRef = {
    stageKey: string | null;
    path: string;
    commitSha: string;
    createdAt: string;
};

export type CardOrigin = "repository" | "board";

export type AgentAttachmentRef = {
    id: string;
    name: string;
    contentType: AttachmentType;
    size: number;
};

/** The free-text request a person wrote on the board, with the files attached to it. */
export type AgentCardRequest = {
    text: string;
    attachments: AgentAttachmentRef[];
    requestedBy: { login: string };
    requestedAt: string;
};

/** What `get_attachment` answers: the file itself, base64-encoded. */
export type AgentAttachmentContent = AgentAttachmentRef & { base64: string };

/** What `get_card` answers: named fields only, never instructions assembled by the board. */
export type AgentCardView = {
    card: {
        id: string;
        boardId: string;
        slug: string;
        title: string;
        lane: CardLane;
        stageKey: string | null;
        state: CardState;
        reworkLoops: number;
        branch: string | null;
        origin: CardOrigin;
        /** Set while the card runs inside a cycle, where `ask` is refused. */
        cycleId: string | null;
    };
    run: {
        id: string;
        stageKey: string;
        command: string;
        model: StageConfig["model"];
        effort: StageConfig["effort"];
        maxTurns: number;
        branch: string;
        deadlineAt: string | null;
    };
    repository: { owner: string; name: string; baseBranch: string };
    /** `content` and `sha` are `null` when the board could not read the file from GitHub. */
    spec: {
        path: string;
        ref: string;
        sha: string | null;
        content: string | null;
    };
    /** The request typed on the board for a card born there; `null` for a card synced from the repository. */
    request: AgentCardRequest | null;
    pendingAsk: CardPendingAsk | null;
    answers: AgentAnsweredQuestion[];
    artifacts: AgentArtifactRef[];
    /** The pull request the board opened for the card, `null` before the pull request stage. */
    pullRequest: {
        number: number;
        url: string;
        draft: boolean;
        state: PullRequestState;
    } | null;
};

export type AgentEventResult = { eventId: string };

/** `ignored` is `true` when the run had already ended, so the call changed nothing. */
export type AgentCompleteResult = { ignored: boolean };
