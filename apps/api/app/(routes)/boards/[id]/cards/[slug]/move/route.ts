import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { decideCardMove } from "@/(shared)/lib/card-move";
import { nextTasksOrder } from "@/(shared)/lib/card-order";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { parseMoveCard } from "@/(shared)/validation/card.schema";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

const MOVE_REFUSAL_STATUS = {
    CARD_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
    CARD_RUN_ACTIVE: HTTP_STATUS.CONFLICT,
    CARD_DRAFT_NOT_APPROVED: HTTP_STATUS.CONFLICT,
} as const;

/** Takes a card to Tasks or Done; entering a stage is the `runs` route. */
export const POST = requireBoardApi<CardRouteParams>(
    "prioritize",
    async (req, ctx) => {
        const body = await parseRequestJson(req);
        if (!body.ok) {
            return body.response;
        }
        const parsed = parseMoveCard(body.value);
        if (!parsed.ok) {
            return parsed.response;
        }
        const target = parsed.value;

        const card = await cardRepository.findBySlug(
            ctx.board.id,
            ctx.params.slug
        );
        if (!card) {
            return errorResponse("CARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
        }

        const decision = decideCardMove(card, target);
        if (!decision.ok) {
            return errorResponse(decision.code, decision.status);
        }
        if (decision.unchanged) {
            return Response.json({ data: toCardDTO(card) });
        }

        const order =
            target.lane === "tasks"
                ? nextTasksOrder(await cardRepository.listByBoard(ctx.board.id))
                : undefined;
        const moved = await cardRepository.move(card.id, {
            lane: target.lane,
            order,
            movedByUserId: ctx.subjectProfile.id,
        });
        if (!moved.ok) {
            return errorResponse(moved.code, MOVE_REFUSAL_STATUS[moved.code]);
        }
        return Response.json({ data: toCardDTO(moved.card) });
    }
);
