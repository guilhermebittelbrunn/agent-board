import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { type AnswerRefusal, personAuthor } from "@/(shared)/lib/card-events";
import { resumeAfterAnswer } from "@/(shared)/lib/orchestrator/orchestrator";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { toCardEventView } from "@/(shared)/mappers/card-event.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { parseAnswerQuestions } from "@/(shared)/validation/card-event.schema";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

const REFUSAL_STATUS: Record<AnswerRefusal, number> = {
    CARD_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
    CARD_QUESTIONS_NOT_PENDING: HTTP_STATUS.CONFLICT,
    CARD_ANSWERS_MISMATCH: HTTP_STATUS.UNPROCESSABLE_ENTITY,
};

/**
 * Closes the card's pending questions, then runs the stage again with the answers. The
 * answer is already stored when the rerun is attempted, so a rerun that fails never turns
 * it into an error: the card offers "run again" instead.
 */
export const POST = requireBoardApi<CardRouteParams>(
    "answer",
    async (req, ctx) => {
        const body = await parseRequestJson(req);
        if (!body.ok) {
            return body.response;
        }
        const parsed = parseAnswerQuestions(body.value);
        if (!parsed.ok) {
            return parsed.response;
        }
        const card = await cardRepository.findBySlug(
            ctx.board.id,
            ctx.params.slug
        );
        if (!card) {
            return Response.json(
                { error: { code: "CARD_NOT_FOUND" } },
                { status: REFUSAL_STATUS.CARD_NOT_FOUND }
            );
        }
        const result = await cardEventRepository.answer({
            cardId: card.id,
            questionEventId: parsed.value.questionEventId,
            author: personAuthor(ctx.profile),
            answers: parsed.value.answers,
        });
        if (!result.ok) {
            return Response.json(
                { error: { code: result.code } },
                { status: REFUSAL_STATUS[result.code] }
            );
        }
        try {
            await resumeAfterAnswer({
                board: ctx.board,
                slug: ctx.params.slug,
                by: { userId: ctx.profile.id, login: ctx.member.login },
            });
        } catch (error) {
            logEvent("orchestrator", "resume_after_answer_failed", {
                boardId: ctx.board.id,
                name: error instanceof Error ? error.name : "unknown",
            });
        }
        const current = await cardRepository.findById(card.id);
        return Response.json({
            data: {
                event: toCardEventView(result.event, ctx.profile.id),
                card: toCardDTO(current ?? result.card),
            },
        });
    }
);
