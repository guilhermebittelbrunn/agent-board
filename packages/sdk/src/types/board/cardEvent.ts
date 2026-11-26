import type {
    Answer,
    CardEventAuthor,
    CardLane,
    Question,
    ResolvedAnswer,
    StageOutcome,
} from "@repo/kanban-contract";
import type { CardDTO } from "./card";

type CardEventBase = {
    id: string;
    boardId: string;
    cardId: string;
    /** `null` when the card sat in Tasks or Done at the time; `lane` says which. */
    stageKey: string | null;
    lane: CardLane;
    author: CardEventAuthor;
    runId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type CardEventDTO =
    | (CardEventBase & { type: "update"; markdown: string })
    | (CardEventBase & {
          type: "question";
          questions: Question[];
          answeredByEventId: string | null;
      })
    | (CardEventBase & {
          type: "answer";
          questionEventId: string;
          answers: ResolvedAnswer[];
      })
    | (CardEventBase & {
          type: "artifact";
          artifact: { path: string; commitSha: string };
      })
    | (CardEventBase & {
          type: "report";
          markdown: string;
          outcome: StageOutcome;
      })
    | (CardEventBase & {
          type: "comment";
          markdown: string;
          editedAt: string | null;
      });

/** An event as the person reading the timeline sees it: `isOwn` marks their own comments. */
export type CardEventViewDTO = CardEventDTO & { isOwn: boolean };

export type CardCommentRequest = { markdown: string };

export type AnswerQuestionsRequest = {
    questionEventId: string;
    answers: Answer[];
};

export type AnswerQuestionsResultDTO = {
    event: CardEventViewDTO;
    card: CardDTO;
};
