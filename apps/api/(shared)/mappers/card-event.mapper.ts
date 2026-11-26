import {
    CARD_EVENT_TYPES,
    CARD_LANES,
    type CardEventAuthor,
    type CardEventType,
    type CardLane,
    type Question,
    type ResolvedAnswer,
    STAGE_OUTCOMES,
    type StageOutcome,
} from "@repo/kanban-contract";
import type { CardEventDTO, CardEventViewDTO } from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import Mapper from "./Mapper";

export const CARD_EVENT_TABLE = "cardEvent";

export type CardEventFirestoreRow = Record<string, unknown> & { id: string };

/**
 * What a card event stores. Every field exists on every document, `null` where the type
 * does not use it, so a query never has to tell a missing field from an empty one.
 */
export type CardEventDocument = {
    boardId: string;
    cardId: string;
    stageKey: string | null;
    lane: CardLane;
    type: CardEventType;
    author: CardEventAuthor;
    markdown: string | null;
    questions: Question[] | null;
    answers: ResolvedAnswer[] | null;
    questionEventId: string | null;
    answeredByEventId: string | null;
    artifact: { path: string; commitSha: string } | null;
    outcome: StageOutcome | null;
    runId: string | null;
    editedAt: Date | null;
};

/** The fields a write sets for one type; the rest are filled with `null`. */
export type CardEventWrite = Pick<
    CardEventDocument,
    "boardId" | "cardId" | "stageKey" | "lane" | "type" | "author"
> &
    Partial<
        Pick<
            CardEventDocument,
            | "markdown"
            | "questions"
            | "answers"
            | "questionEventId"
            | "artifact"
            | "outcome"
            | "runId"
        >
    >;

export function cardEventDocument(write: CardEventWrite): CardEventDocument {
    return {
        boardId: write.boardId,
        cardId: write.cardId,
        stageKey: write.stageKey,
        lane: write.lane,
        type: write.type,
        author: write.author,
        markdown: write.markdown ?? null,
        questions: write.questions ?? null,
        answers: write.answers ?? null,
        questionEventId: write.questionEventId ?? null,
        answeredByEventId: null,
        artifact: write.artifact ?? null,
        outcome: write.outcome ?? null,
        runId: write.runId ?? null,
        editedAt: null,
    };
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

const text = (value: unknown): string =>
    typeof value === "string" ? value : "";

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

const asLane = (value: unknown): CardLane =>
    CARD_LANES.includes(value as CardLane) ? (value as CardLane) : "tasks";

const asType = (value: unknown): CardEventType =>
    CARD_EVENT_TYPES.includes(value as CardEventType)
        ? (value as CardEventType)
        : "update";

const asOutcome = (value: unknown): StageOutcome =>
    STAGE_OUTCOMES.includes(value as StageOutcome)
        ? (value as StageOutcome)
        : "failed";

const asList = <T>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [];

function toAuthor(value: unknown): CardEventAuthor {
    const author = asRecord(value);
    if (author.kind === "person") {
        return {
            kind: "person",
            userId: text(author.userId),
            login: text(author.login),
        };
    }
    return { kind: "agent", name: text(author.name) };
}

class CardEventMapper extends Mapper<CardEventFirestoreRow, CardEventDTO> {
    toDTO(row: CardEventFirestoreRow): CardEventDTO {
        const base = {
            id: row.id,
            boardId: text(row.boardId),
            cardId: text(row.cardId),
            stageKey: textOrNull(row.stageKey),
            lane: asLane(row.lane),
            author: toAuthor(row.author),
            runId: textOrNull(row.runId),
            createdAt: normalizeFirestoreInstant(row.createdAt),
            updatedAt: normalizeFirestoreInstant(row.updatedAt),
        };

        switch (asType(row.type)) {
            case "question":
                return {
                    ...base,
                    type: "question",
                    questions: asList<Question>(row.questions),
                    answeredByEventId: textOrNull(row.answeredByEventId),
                };
            case "answer":
                return {
                    ...base,
                    type: "answer",
                    questionEventId: text(row.questionEventId),
                    answers: asList<ResolvedAnswer>(row.answers),
                };
            case "artifact": {
                const artifact = asRecord(row.artifact);
                return {
                    ...base,
                    type: "artifact",
                    artifact: {
                        path: text(artifact.path),
                        commitSha: text(artifact.commitSha),
                    },
                };
            }
            case "report":
                return {
                    ...base,
                    type: "report",
                    markdown: text(row.markdown),
                    outcome: asOutcome(row.outcome),
                };
            case "comment":
                return {
                    ...base,
                    type: "comment",
                    markdown: text(row.markdown),
                    editedAt:
                        row.editedAt == null
                            ? null
                            : normalizeFirestoreInstant(row.editedAt),
                };
            default:
                return {
                    ...base,
                    type: "update",
                    markdown: text(row.markdown),
                };
        }
    }

    toPersistence(
        input: AllOptional<CardEventDTO> | Record<string, unknown>
    ): AllOptional<Record<string, unknown>> {
        const { id: _id, ...rest } = input as Record<string, unknown>;
        return rest as AllOptional<Record<string, unknown>>;
    }
}

export const cardEventMapper = new CardEventMapper();

/** Only the author of a comment may edit or delete it; agent events are never editable. */
export function isOwnComment(event: CardEventDTO, userId: string): boolean {
    return (
        event.type === "comment" &&
        event.author.kind === "person" &&
        event.author.userId === userId
    );
}

export const toCardEventView = (
    event: CardEventDTO,
    userId: string
): CardEventViewDTO => ({ ...event, isOwn: isOwnComment(event, userId) });
