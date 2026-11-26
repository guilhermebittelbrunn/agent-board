/**
 * Turns the timeline fixture into Firestore documents for one card. Pure, so a test can
 * check the documents against the real mapper and the contract schemas.
 */

const MS_PER_MINUTE = 60_000;
const SLUG_PLACEHOLDER = /\{slug\}/g;

export const fixtureEventId = (cardId, key) => `fixture_${cardId}_${key}`;

const withSlug = (value, slug) =>
    typeof value === "string" ? value.replace(SLUG_PLACEHOLDER, slug) : value;

export function buildTimelineDocuments(fixture, { boardId, slug, now }) {
    const cardId = `${boardId}__${slug}`;
    const pendingId = fixtureEventId(cardId, fixture.pendingQuestion);

    const events = fixture.events.map((event) => {
        const at = new Date(now.getTime() - event.minutesAgo * MS_PER_MINUTE);
        return {
            id: fixtureEventId(cardId, event.key),
            document: {
                boardId,
                cardId,
                stageKey: event.stageKey ?? null,
                lane: event.lane,
                type: event.type,
                author: event.author,
                markdown: withSlug(event.markdown, slug) ?? null,
                questions: event.questions ?? null,
                answers: null,
                questionEventId: null,
                answeredByEventId: null,
                artifact: event.artifact
                    ? {
                          path: withSlug(event.artifact.path, slug),
                          commitSha: event.artifact.commitSha,
                      }
                    : null,
                outcome: event.outcome ?? null,
                runId: null,
                editedAt: null,
                createdAt: at,
                updatedAt: at,
                deletedAt: null,
            },
        };
    });

    const pending = events.find((event) => event.id === pendingId);
    return {
        cardId,
        events,
        pendingAsk: {
            eventId: pendingId,
            stageKey: pending.document.stageKey,
            count: pending.document.questions.length,
        },
    };
}
