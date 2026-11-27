import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

const NO_CONTENT = 204;

const DISCARD_REFUSAL_STATUS = {
    CARD_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
    CARD_NOT_DRAFT: HTTP_STATUS.CONFLICT,
    CARD_RUN_ACTIVE: HTTP_STATUS.CONFLICT,
    CARD_SPEC_NOT_READY: HTTP_STATUS.CONFLICT,
} as const;

/** Takes a draft off the board. Its branch, and anything the agent pushed there, stay on GitHub. */
export const POST = requireBoardApi<CardRouteParams>(
    "prioritize",
    async (_req, ctx) => {
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
        const refusal = await cardRepository.discardDraft(card.id, new Date());
        if (refusal !== null) {
            return Response.json(
                { error: { code: refusal } },
                { status: DISCARD_REFUSAL_STATUS[refusal] }
            );
        }
        return new Response(null, { status: NO_CONTENT });
    }
);
