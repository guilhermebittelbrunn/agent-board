import type { CardEventDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import {
    isOwnComment,
    toCardEventView,
} from "@/(shared)/mappers/card-event.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { parseCardComment } from "@/(shared)/validation/card-event.schema";
import { type BoardAuthContext, requireBoardApi } from "@/app/(guards)/board";

type EventRouteParams = { id: string; slug: string; eventId: string };

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

/**
 * The event, read through the card of this board: an id from another card or board is
 * answered as missing. Only the author's own comment gets past here.
 */
async function findOwnComment(
    ctx: BoardAuthContext & { params: EventRouteParams }
): Promise<
    { ok: true; event: CardEventDTO } | { ok: false; response: Response }
> {
    const card = await cardRepository.findBySlug(ctx.board.id, ctx.params.slug);
    if (!card) {
        return {
            ok: false,
            response: errorResponse("CARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND),
        };
    }
    const event = await cardEventRepository.findInCard(
        card.id,
        ctx.params.eventId
    );
    if (!event) {
        return {
            ok: false,
            response: errorResponse(
                "CARD_EVENT_NOT_FOUND",
                HTTP_STATUS.NOT_FOUND
            ),
        };
    }
    if (!isOwnComment(event, ctx.profile.id)) {
        return {
            ok: false,
            response: errorResponse(
                "CARD_EVENT_NOT_EDITABLE",
                HTTP_STATUS.FORBIDDEN
            ),
        };
    }
    return { ok: true, event };
}

export const PATCH = requireBoardApi<EventRouteParams>(
    "comment",
    async (req: NextRequest, ctx) => {
        const body = await parseRequestJson(req);
        if (!body.ok) {
            return body.response;
        }
        const parsed = parseCardComment(body.value);
        if (!parsed.ok) {
            return parsed.response;
        }
        const found = await findOwnComment(ctx);
        if (!found.ok) {
            return found.response;
        }
        const edited = await cardEventRepository.editComment(
            found.event.id,
            parsed.value.markdown
        );
        if (!edited) {
            return errorResponse("CARD_EVENT_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
        }
        return Response.json({
            data: toCardEventView(edited, ctx.profile.id),
        });
    }
);

export const DELETE = requireBoardApi<EventRouteParams>(
    "comment",
    async (_req, ctx) => {
        const found = await findOwnComment(ctx);
        if (!found.ok) {
            return found.response;
        }
        await cardEventRepository.removeComment(found.event.id);
        return new Response(null, { status: 204 });
    }
);
