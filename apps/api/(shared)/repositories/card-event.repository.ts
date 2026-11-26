import type { Answer, CardEventAuthor } from "@repo/kanban-contract";
import type { CardEventDTO } from "@repo/sdk/src/types";
import { type AnswerRefusal, planAnswer } from "@/(shared)/lib/card-events";
import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import db from "../infra/database";
import {
    CARD_TABLE,
    type CardRecord,
    cardMapper,
} from "../mappers/card.mapper";
import {
    CARD_EVENT_TABLE,
    type CardEventWrite,
    cardEventDocument,
    cardEventMapper,
} from "../mappers/card-event.mapper";
import { BaseRepository } from "./base.repository";

export type AnswerQuestionsResult =
    | { ok: true; event: CardEventDTO; card: CardRecord }
    | { ok: false; code: AnswerRefusal };

export type AppendAgentEventResult =
    | { ok: true; event: CardEventDTO }
    | { ok: false; code: "AGENT_RUN_CLOSED" };

export type AnswerQuestionsCommand = {
    cardId: string;
    questionEventId: string;
    author: CardEventAuthor;
    answers: Answer[];
};

const byCreation = (left: CardEventDTO, right: CardEventDTO): number =>
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id);

class CardEventRepository extends BaseRepository<CardEventDTO> {
    constructor() {
        super(db, CARD_EVENT_TABLE, cardEventMapper);
    }

    private cardRef(cardId: string) {
        return this.db.collection(CARD_TABLE).doc(cardId);
    }

    /**
     * Equality filters only, so no composite index is needed; a card holds a few hundred
     * events at most, sorted here oldest first.
     */
    async listByCard(cardId: string): Promise<CardEventDTO[]> {
        const snapshot = await this.db
            .collection(this.table)
            .where("cardId", "==", cardId)
            .where("deletedAt", "==", null)
            .get();
        return snapshot.docs
            .map((docSnap) =>
                this.toDTO(
                    docSnap.id,
                    docSnap.data() as Record<string, unknown>
                )
            )
            .sort(byCreation);
    }

    async findInCard(
        cardId: string,
        eventId: string
    ): Promise<CardEventDTO | null> {
        const event = await this.findById(eventId);
        return event?.cardId === cardId ? event : null;
    }

    async appendComment(
        card: CardRecord,
        author: CardEventAuthor,
        markdown: string
    ): Promise<CardEventDTO> {
        const at = new Date();
        const document = {
            ...cardEventDocument({
                boardId: card.boardId,
                cardId: card.id,
                stageKey: card.stageKey,
                lane: card.lane,
                type: "comment",
                author,
                markdown,
            }),
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
        };
        const ref = await this.db.collection(this.table).add(document);
        return this.toDTO(ref.id, document);
    }

    async editComment(
        id: string,
        markdown: string
    ): Promise<CardEventDTO | null> {
        const at = new Date();
        await this.db
            .collection(this.table)
            .doc(id)
            .update({ markdown, editedAt: at, updatedAt: at });
        return this.findById(id);
    }

    async removeComment(id: string): Promise<void> {
        await this.delete(id);
    }

    /**
     * Writes an agent event. A question opens the card's pending ask in the same
     * transaction, replacing an older one still open: that one stays on the timeline
     * unanswered. A question from a run the card no longer runs is refused, so a late ask
     * cannot leave its pending ask on the card's next run.
     */
    async appendAgentEvent(
        card: Pick<CardRecord, "id">,
        write: CardEventWrite
    ): Promise<AppendAgentEventResult> {
        const ref = this.db.collection(this.table).doc();
        const cardRef = this.cardRef(card.id);
        const at = new Date();
        const document = {
            ...cardEventDocument(write),
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
        };
        const opensAsk = write.type === "question" && write.stageKey !== null;
        const written = await this.db.runTransaction(async (transaction) => {
            if (opensAsk && write.runId != null) {
                const current = await transaction.get(cardRef);
                if (current.data()?.activeRunId !== write.runId) {
                    return false;
                }
            }
            transaction.set(ref, document);
            if (opensAsk) {
                transaction.update(cardRef, {
                    pendingAsk: {
                        eventId: ref.id,
                        stageKey: write.stageKey,
                        count: write.questions?.length ?? 0,
                    },
                    updatedAt: at,
                });
            }
            return true;
        });
        return written
            ? { ok: true, event: this.toDTO(ref.id, document) }
            : { ok: false, code: "AGENT_RUN_CLOSED" };
    }

    /**
     * Answers the card's pending questions, once: the check against the pending ask and
     * the writes run in one transaction, so two people answering at once cannot both win.
     */
    async answer(
        command: AnswerQuestionsCommand
    ): Promise<AnswerQuestionsResult> {
        if (!isUsableDocumentId(command.questionEventId)) {
            return { ok: false, code: "CARD_QUESTIONS_NOT_PENDING" };
        }
        const cardRef = this.cardRef(command.cardId);
        const questionRef = this.db
            .collection(this.table)
            .doc(command.questionEventId);
        const answerRef = this.db.collection(this.table).doc();

        return await this.db.runTransaction(
            async (transaction): Promise<AnswerQuestionsResult> => {
                const [cardSnap, questionSnap] = await Promise.all([
                    transaction.get(cardRef),
                    transaction.get(questionRef),
                ]);
                const cardData = cardSnap.data();
                const card =
                    cardSnap.exists && cardData?.deletedAt == null
                        ? cardMapper.toDTO({ id: cardSnap.id, ...cardData })
                        : null;
                const questionData = questionSnap.data();
                const question =
                    questionSnap.exists && questionData?.deletedAt == null
                        ? this.toDTO(questionSnap.id, questionData ?? {})
                        : null;
                const plan = planAnswer({
                    card,
                    question,
                    questionEventId: command.questionEventId,
                    answers: command.answers,
                });
                if (!(plan.ok && card)) {
                    return {
                        ok: false,
                        code: plan.ok ? "CARD_NOT_FOUND" : plan.code,
                    };
                }

                const at = new Date();
                const document = {
                    ...cardEventDocument({
                        boardId: card.boardId,
                        cardId: card.id,
                        stageKey: plan.stageKey,
                        lane: card.lane,
                        type: "answer",
                        author: command.author,
                        answers: plan.answers,
                        questionEventId: command.questionEventId,
                    }),
                    createdAt: at,
                    updatedAt: at,
                    deletedAt: null,
                };
                transaction.set(answerRef, document);
                transaction.update(questionRef, {
                    answeredByEventId: answerRef.id,
                    updatedAt: at,
                });
                transaction.update(cardRef, {
                    pendingAsk: null,
                    updatedAt: at,
                });

                return {
                    ok: true,
                    event: this.toDTO(answerRef.id, document),
                    card: {
                        ...card,
                        pendingAsk: null,
                        updatedAt: at.toISOString(),
                    },
                };
            }
        );
    }
}

export const cardEventRepository = new CardEventRepository();
