import type { StageConfig } from "./boardConfig";
import type { CardLane } from "./boardLanes";
import type { CardPendingAsk, ResolvedAnswer } from "./cardEvent";
import type { CardState } from "./cardState";

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
    pendingAsk: CardPendingAsk | null;
    answers: AgentAnsweredQuestion[];
    artifacts: AgentArtifactRef[];
};

export type AgentEventResult = { eventId: string };

/** `ignored` is `true` when the run had already ended, so the call changed nothing. */
export type AgentCompleteResult = { ignored: boolean };
