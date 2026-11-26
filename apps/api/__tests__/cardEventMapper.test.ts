import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { cardIdFor, cardMapper } from "@/(shared)/mappers/card.mapper";
import {
    cardEventDocument,
    cardEventMapper,
    toCardEventView,
} from "@/(shared)/mappers/card-event.mapper";

const AT = "2026-11-26T10:00:00.000Z";
const stamp = Timestamp.fromDate(new Date(AT));
const base = {
    boardId: "b",
    cardId: cardIdFor("b", "search-cards"),
    stageKey: "analyze",
    lane: "stage" as const,
};
const row = (write: Parameters<typeof cardEventDocument>[0]) => ({
    id: "e1",
    ...cardEventDocument(write),
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
});

describe("cardEventMapper", () => {
    it("turns timestamps into ISO and keeps only the fields of the type", () => {
        const event = cardEventMapper.toDTO(
            row({
                ...base,
                type: "report",
                author: { kind: "agent", name: "desenvolvedor" },
                markdown: "### Develop",
                outcome: "success",
            })
        );

        expect(event).toEqual({
            id: "e1",
            ...base,
            type: "report",
            author: { kind: "agent", name: "desenvolvedor" },
            markdown: "### Develop",
            outcome: "success",
            runId: null,
            createdAt: AT,
            updatedAt: AT,
        });
    });

    it("reads a comment's edit time and its author", () => {
        const event = cardEventMapper.toDTO({
            ...row({
                ...base,
                type: "comment",
                author: { kind: "person", userId: "u1", login: "octo" },
                markdown: "oi",
            }),
            editedAt: stamp,
        });

        expect(event).toMatchObject({
            type: "comment",
            editedAt: AT,
            author: { kind: "person", userId: "u1", login: "octo" },
        });
    });

    it("reads a question and its answer link", () => {
        const event = cardEventMapper.toDTO({
            ...row({
                ...base,
                type: "question",
                author: { kind: "agent", name: "planejador-tarefa" },
                questions: [
                    {
                        question: "Escopo?",
                        header: "Escopo",
                        options: [{ label: "A" }, { label: "B" }],
                    },
                ],
            }),
            answeredByEventId: "e2",
        });

        expect(event).toMatchObject({
            type: "question",
            answeredByEventId: "e2",
        });
        expect(Object.keys(event)).not.toContain("markdown");
    });

    it("marks only the reader's own comment as theirs", () => {
        const comment = cardEventMapper.toDTO(
            row({
                ...base,
                type: "comment",
                author: { kind: "person", userId: "u1", login: "octo" },
                markdown: "oi",
            })
        );
        const update = cardEventMapper.toDTO(
            row({
                ...base,
                type: "update",
                author: { kind: "agent", name: "u1" },
                markdown: "oi",
            })
        );

        expect(toCardEventView(comment, "u1").isOwn).toBe(true);
        expect(toCardEventView(comment, "u2").isOwn).toBe(false);
        expect(toCardEventView(update, "u1").isOwn).toBe(false);
    });
});

describe("cardMapper pendingAsk", () => {
    const cardRow = (extra: Record<string, unknown>) => ({
        id: cardIdFor("b", "search-cards"),
        boardId: "b",
        slug: "search-cards",
        lane: "stage",
        stageKey: "analyze",
        ...extra,
    });

    it("reads a missing or broken pending ask as null", () => {
        expect(cardMapper.toDTO(cardRow({})).pendingAsk).toBeNull();
        expect(
            cardMapper.toDTO(cardRow({ pendingAsk: { count: 2 } })).pendingAsk
        ).toBeNull();
    });

    it("reads the pending ask", () => {
        expect(
            cardMapper.toDTO(
                cardRow({
                    pendingAsk: {
                        eventId: "e1",
                        stageKey: "analyze",
                        count: 2,
                    },
                })
            ).pendingAsk
        ).toEqual({ eventId: "e1", stageKey: "analyze", count: 2 });
    });
});
