import { z } from "zod";
import { MAX_MARKDOWN, type Question } from "./agentContract";
import type { CardState } from "./cardState";

export const CARD_EVENT_TYPES = [
    "update",
    "question",
    "answer",
    "artifact",
    "report",
    "comment",
] as const;
export type CardEventType = (typeof CARD_EVENT_TYPES)[number];

/** `login` is stored with the event so it stays readable after the person leaves the board. */
export type CardEventAuthor =
    | { kind: "agent"; name: string }
    | { kind: "person"; userId: string; login: string };

/** The questions of a stage still waiting for an answer, kept on the card itself. */
export type CardPendingAsk = {
    eventId: string;
    stageKey: string;
    count: number;
};

export const MAX_ANSWER_TEXT = 2000;
const MAX_QUESTIONS = 4;
const MAX_EVENT_ID = 128;

export const answerSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("option"),
        option: z
            .number()
            .int()
            .min(0)
            .max(MAX_QUESTIONS - 1),
    }),
    z.object({
        kind: z.literal("text"),
        text: z.string().trim().min(1).max(MAX_ANSWER_TEXT),
    }),
]);
export type Answer = z.infer<typeof answerSchema>;

export const answerQuestionsInputSchema = z.object({
    questionEventId: z.string().min(1).max(MAX_EVENT_ID),
    answers: z.array(answerSchema).min(1).max(MAX_QUESTIONS),
});
export type AnswerQuestionsInput = z.infer<typeof answerQuestionsInputSchema>;

export const cardCommentInputSchema = z.object({
    markdown: z.string().trim().min(1).max(MAX_MARKDOWN),
});
export type CardCommentInput = z.infer<typeof cardCommentInputSchema>;

export type ResolvedAnswerChoice =
    | { kind: "option"; option: number; label: string }
    | { kind: "text"; text: string };

/** The label of the chosen option is copied, so the answer reads the same wherever it is shown later. */
export type ResolvedAnswer = {
    question: string;
    header: string;
    choice: ResolvedAnswerChoice;
};

export function resolveAnswers(
    questions: Question[],
    answers: Answer[]
): { ok: true; answers: ResolvedAnswer[] } | { ok: false } {
    if (questions.length === 0 || answers.length !== questions.length) {
        return { ok: false };
    }
    const resolved: ResolvedAnswer[] = [];
    for (const [index, question] of questions.entries()) {
        const answer = answers[index];
        if (answer === undefined) {
            return { ok: false };
        }
        if (answer.kind === "text") {
            resolved.push({
                question: question.question,
                header: question.header,
                choice: { kind: "text", text: answer.text },
            });
            continue;
        }
        const option = question.options[answer.option];
        if (option === undefined) {
            return { ok: false };
        }
        resolved.push({
            question: question.question,
            header: question.header,
            choice: {
                kind: "option",
                option: answer.option,
                label: option.label,
            },
        });
    }
    return { ok: true, answers: resolved };
}

/**
 * The state a person sees: a card with unanswered questions waits for them even before the
 * orchestrator records `waiting_input`, and answering clears it without touching `state`.
 */
export function displayCardState(card: {
    state: CardState;
    pendingAsk: CardPendingAsk | null;
}): CardState {
    return card.pendingAsk === null ? card.state : "waiting_input";
}
