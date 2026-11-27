import type { MoveCardRequest } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { CardRecord } from "@/(shared)/mappers/card.mapper";

export type CardMoveDecision =
    | { ok: false; code: string; status: number }
    | { ok: true; unchanged: boolean };

/**
 * Whether a person may take this card to Tasks or Done. Entering a stage column triggers
 * the stage instead, a card with a live run stays where it is until the run ends, and a
 * spec draft leaves Drafts only when its spec is approved.
 */
export function decideCardMove(
    card: Pick<CardRecord, "lane" | "ready" | "activeRunId">,
    target: MoveCardRequest
): CardMoveDecision {
    if (card.lane === "drafts") {
        return {
            ok: false,
            code: "CARD_DRAFT_NOT_APPROVED",
            status: HTTP_STATUS.CONFLICT,
        };
    }
    if (card.activeRunId !== null) {
        return {
            ok: false,
            code: "CARD_RUN_ACTIVE",
            status: HTTP_STATUS.CONFLICT,
        };
    }
    if (card.lane === "tasks" && !card.ready && target.lane !== "tasks") {
        return {
            ok: false,
            code: "CARD_NOT_READY",
            status: HTTP_STATUS.CONFLICT,
        };
    }
    return { ok: true, unchanged: card.lane === target.lane };
}
