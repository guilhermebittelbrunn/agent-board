import {
    type AnswerQuestionsInput,
    answerQuestionsInputSchema,
    type CardCommentInput,
    cardCommentInputSchema,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const validationFailed = (): { ok: false; response: Response } => ({
    ok: false,
    response: Response.json(
        { error: { code: "VALIDATION_FAILED" } },
        { status: HTTP_STATUS.BAD_REQUEST }
    ),
});

export function parseCardComment(body: unknown): Parsed<CardCommentInput> {
    const parsed = cardCommentInputSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}

export function parseAnswerQuestions(
    body: unknown
): Parsed<AnswerQuestionsInput> {
    const parsed = answerQuestionsInputSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}
