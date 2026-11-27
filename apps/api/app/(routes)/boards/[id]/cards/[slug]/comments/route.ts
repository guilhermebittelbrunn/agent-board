import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { personAuthor } from "@/(shared)/lib/card-events";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toCardEventView } from "@/(shared)/mappers/card-event.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { parseCardComment } from "@/(shared)/validation/card-event.schema";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

/** The comment is filed under the stage the card is in when it is written. */
export const POST = requireBoardApi<CardRouteParams>(
    "comment",
    async (req, ctx) => {
        const body = await parseRequestJson(req);
        if (!body.ok) {
            return body.response;
        }
        const parsed = parseCardComment(body.value);
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
                { status: HTTP_STATUS.NOT_FOUND }
            );
        }
        const event = await cardEventRepository.appendComment(
            card,
            personAuthor(ctx.profile),
            parsed.value.markdown
        );
        return Response.json(
            { data: toCardEventView(event, ctx.profile.id) },
            { status: HTTP_STATUS.CREATED }
        );
    }
);
