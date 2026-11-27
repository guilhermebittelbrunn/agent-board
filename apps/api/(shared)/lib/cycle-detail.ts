import type {
    CardEventDTO,
    CycleActivityDTO,
    CycleDecisionDTO,
    CycleDetailDTO,
} from "@repo/sdk/src/types";
import { type CardRecord, toCardDTO } from "@/(shared)/mappers/card.mapper";
import { type CycleRecord, toCycleDTO } from "@/(shared)/mappers/cycle.mapper";

const MAX_ACTIVITY = 10;

/**
 * The cycle screen in one answer: the cards of its items in the cycle's order, the decisions
 * its agents reported and the latest activity. `events` come newest first.
 */
export function toCycleDetail(
    cycle: CycleRecord,
    cards: CardRecord[],
    events: CardEventDTO[]
): CycleDetailDTO {
    const byId = new Map(cards.map((card) => [card.id, card]));
    const slugByCard = new Map(
        cycle.items.map((item) => [item.cardId, item.slug])
    );
    const decisions: CycleDecisionDTO[] = events.flatMap((event) =>
        event.type === "report"
            ? event.decisions.map((decision) => ({
                  ...decision,
                  eventId: event.id,
                  slug: slugByCard.get(event.cardId) ?? "",
                  stageKey: event.stageKey,
                  at: event.createdAt,
              }))
            : []
    );
    const activity: CycleActivityDTO[] = events
        .flatMap((event) =>
            event.type === "update" || event.type === "report"
                ? [
                      {
                          eventId: event.id,
                          slug: slugByCard.get(event.cardId) ?? "",
                          stageKey: event.stageKey,
                          type: event.type,
                          markdown: event.markdown,
                          at: event.createdAt,
                      },
                  ]
                : []
        )
        .slice(0, MAX_ACTIVITY);
    return {
        cycle: toCycleDTO(cycle),
        cards: cycle.items.flatMap((item) => {
            const card = byId.get(item.cardId);
            return card === undefined ? [] : [toCardDTO(card)];
        }),
        decisions,
        activity,
    };
}
