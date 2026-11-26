import type { CardEventAuthor } from "@repo/kanban-contract";
import type { CardEventDTO } from "@repo/sdk/src/types";
import { planAnswer } from "@/(shared)/lib/card-events";
import type { CardRecord } from "@/(shared)/mappers/card.mapper";
import {
    type CardEventWrite,
    cardEventDocument,
    cardEventMapper,
} from "@/(shared)/mappers/card-event.mapper";
import type {
    AnswerQuestionsCommand,
    AnswerQuestionsResult,
    AppendAgentEventResult,
} from "@/(shared)/repositories/card-event.repository";
import type { FakeCardRepository } from "./fakeCardRepository";

type StoredEvent = Record<string, unknown>;

const EVENT_SPACING_MS = 1000;

/**
 * In-memory stand-in for `cardEventRepository`. It writes the pending ask on the cards of
 * the fake card repository, and decides answers with the same `planAnswer` the
 * transaction uses.
 */
export function createFakeCardEventRepository(cards: FakeCardRepository) {
    const documents = new Map<string, StoredEvent>();
    let sequence = 0;
    let clock = Date.parse("2026-11-26T12:00:00.000Z");
    const nextInstant = () => {
        clock += EVENT_SPACING_MS;
        return new Date(clock);
    };

    const read = (id: string): CardEventDTO | null => {
        const document = documents.get(id);
        return document && document.deletedAt == null
            ? cardEventMapper.toDTO({ id, ...document })
            : null;
    };
    const readCard = (id: string): Promise<CardRecord | null> =>
        cards.repository.findById(id);
    const insert = (write: CardEventWrite, id?: string): string => {
        sequence += 1;
        const eventId = id ?? `event-${sequence}`;
        const at = nextInstant();
        documents.set(eventId, {
            ...cardEventDocument(write),
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
        });
        return eventId;
    };
    const patchCard = (cardId: string, patch: Record<string, unknown>) => {
        cards.documents.set(cardId, {
            ...cards.documents.get(cardId),
            ...patch,
        });
    };

    /** Writes an event as an agent would, opening the pending ask for a question. */
    const seed = (write: CardEventWrite, id?: string): string => {
        const eventId = insert(write, id);
        if (write.type === "question" && write.stageKey !== null) {
            patchCard(write.cardId, {
                pendingAsk: {
                    eventId,
                    stageKey: write.stageKey,
                    count: write.questions?.length ?? 0,
                },
            });
        }
        return eventId;
    };

    return {
        documents,
        seed,
        repository: {
            appendAgentEvent(
                _card: Pick<CardRecord, "id">,
                write: CardEventWrite
            ): Promise<AppendAgentEventResult> {
                const opensAsk =
                    write.type === "question" && write.stageKey !== null;
                const activeRunId = cards.documents.get(
                    write.cardId
                )?.activeRunId;
                if (
                    opensAsk &&
                    write.runId != null &&
                    activeRunId !== write.runId
                ) {
                    return Promise.resolve({
                        ok: false,
                        code: "AGENT_RUN_CLOSED",
                    });
                }
                const event = read(seed(write));
                if (event === null) {
                    throw new Error("seeded event was not stored");
                }
                return Promise.resolve({ ok: true, event });
            },
            findById: (id: string) => Promise.resolve(read(id)),
            listByCard(cardId: string) {
                return Promise.resolve(
                    [...documents.keys()]
                        .map((id) => read(id))
                        .filter(
                            (event): event is CardEventDTO =>
                                event !== null && event.cardId === cardId
                        )
                );
            },
            findInCard(cardId: string, eventId: string) {
                const event = read(eventId);
                return Promise.resolve(event?.cardId === cardId ? event : null);
            },
            appendComment(
                card: CardRecord,
                author: CardEventAuthor,
                markdown: string
            ) {
                const id = insert({
                    boardId: card.boardId,
                    cardId: card.id,
                    stageKey: card.stageKey,
                    lane: card.lane,
                    type: "comment",
                    author,
                    markdown,
                });
                return Promise.resolve(read(id));
            },
            editComment(id: string, markdown: string) {
                const at = nextInstant();
                documents.set(id, {
                    ...documents.get(id),
                    markdown,
                    editedAt: at,
                    updatedAt: at,
                });
                return Promise.resolve(read(id));
            },
            removeComment(id: string) {
                documents.set(id, {
                    ...documents.get(id),
                    deletedAt: nextInstant(),
                });
                return Promise.resolve();
            },
            async answer(
                command: AnswerQuestionsCommand
            ): Promise<AnswerQuestionsResult> {
                const card = await readCard(command.cardId);
                const plan = planAnswer({
                    card,
                    question: read(command.questionEventId),
                    questionEventId: command.questionEventId,
                    answers: command.answers,
                });
                if (!(plan.ok && card)) {
                    return {
                        ok: false,
                        code: plan.ok ? "CARD_NOT_FOUND" : plan.code,
                    };
                }
                const eventId = insert({
                    boardId: card.boardId,
                    cardId: card.id,
                    stageKey: plan.stageKey,
                    lane: card.lane,
                    type: "answer",
                    author: command.author,
                    answers: plan.answers,
                    questionEventId: command.questionEventId,
                });
                documents.set(command.questionEventId, {
                    ...documents.get(command.questionEventId),
                    answeredByEventId: eventId,
                });
                patchCard(card.id, { pendingAsk: null });
                const event = read(eventId);
                const updated = await readCard(card.id);
                if (!(event && updated)) {
                    return { ok: false, code: "CARD_NOT_FOUND" };
                }
                return { ok: true, event, card: updated };
            },
        },
    };
}

export type FakeCardEventRepository = ReturnType<
    typeof createFakeCardEventRepository
>;
