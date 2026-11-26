import type { globalTranslations } from "@repo/internationalization/translations/global";
import {
    type Answer,
    MAX_ANSWER_TEXT,
    MAX_MARKDOWN,
    type Question,
} from "@repo/kanban-contract";
import { z } from "zod";
import { fillMessage } from "../(components)/boardConfigIssueMessage";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

export const OTHER_ANSWER = "other";

export type QuestionAnswerValue = { choice: string; text: string };
export type CardQuestionsFormValues = { answers: QuestionAnswerValue[] };
export type CardCommentFormValues = { markdown: string };

/** The recommended option comes checked; without one the person has to choose. */
export function initialQuestionAnswers(
    questions: Question[]
): CardQuestionsFormValues {
    return {
        answers: questions.map((question) => ({
            choice:
                question.recommended === undefined
                    ? ""
                    : String(question.recommended),
            text: "",
        })),
    };
}

export function buildCardQuestionsSchema(dictionary: Dictionary) {
    const questionsCopy =
        dictionary.apps.app.pages.common.boards.cardDetail.questions;

    const answerSchema = z
        .object({ choice: z.string(), text: z.string() })
        .superRefine((value, ctx) => {
            if (value.choice === "") {
                ctx.addIssue({
                    code: "custom",
                    path: ["choice"],
                    message: questionsCopy.required,
                });
                return;
            }
            if (value.choice !== OTHER_ANSWER) {
                return;
            }
            const text = value.text.trim();
            if (text === "") {
                ctx.addIssue({
                    code: "custom",
                    path: ["text"],
                    message: questionsCopy.textRequired,
                });
            } else if (text.length > MAX_ANSWER_TEXT) {
                ctx.addIssue({
                    code: "custom",
                    path: ["text"],
                    message: fillMessage(questionsCopy.textTooLong, {
                        max: MAX_ANSWER_TEXT,
                    }),
                });
            }
        });

    return z.object({ answers: z.array(answerSchema).min(1) });
}

export function toAnswers(values: CardQuestionsFormValues): Answer[] {
    return values.answers.map((answer) =>
        answer.choice === OTHER_ANSWER
            ? { kind: "text", text: answer.text.trim() }
            : { kind: "option", option: Number(answer.choice) }
    );
}

export function buildCardCommentSchema(dictionary: Dictionary) {
    const timelineCopy =
        dictionary.apps.app.pages.common.boards.cardDetail.timeline;

    return z.object({
        markdown: z
            .string()
            .trim()
            .min(1, timelineCopy.commentRequired)
            .max(
                MAX_MARKDOWN,
                fillMessage(timelineCopy.commentTooLong, { max: MAX_MARKDOWN })
            ),
    });
}
