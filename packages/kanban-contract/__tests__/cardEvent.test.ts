import { describe, expect, it } from "vitest";
import { MAX_MARKDOWN, type Question } from "../src/agentContract";
import {
    answerQuestionsInputSchema,
    cardCommentInputSchema,
    displayCardState,
    MAX_ANSWER_TEXT,
    resolveAnswers,
} from "../src/cardEvent";

const QUESTIONS: Question[] = [
    {
        question: "A busca considera o corpo da spec?",
        header: "Escopo",
        options: [{ label: "Só o título" }, { label: "Título e corpo" }],
        recommended: 0,
    },
    {
        question: "Qual atalho abre a busca?",
        header: "Atalho",
        options: [{ label: "Ctrl+K" }, { label: "/" }, { label: "Nenhum" }],
    },
];

describe("resolveAnswers", () => {
    it("copies the label of the chosen option and keeps free text", () => {
        expect(
            resolveAnswers(QUESTIONS, [
                { kind: "option", option: 1 },
                { kind: "text", text: "Usar o atalho /" },
            ])
        ).toEqual({
            ok: true,
            answers: [
                {
                    question: "A busca considera o corpo da spec?",
                    header: "Escopo",
                    choice: {
                        kind: "option",
                        option: 1,
                        label: "Título e corpo",
                    },
                },
                {
                    question: "Qual atalho abre a busca?",
                    header: "Atalho",
                    choice: { kind: "text", text: "Usar o atalho /" },
                },
            ],
        });
    });

    it("refuses fewer or more answers than questions", () => {
        expect(
            resolveAnswers(QUESTIONS, [{ kind: "option", option: 0 }])
        ).toEqual({ ok: false });
        expect(
            resolveAnswers(QUESTIONS, [
                { kind: "option", option: 0 },
                { kind: "option", option: 0 },
                { kind: "option", option: 0 },
            ])
        ).toEqual({ ok: false });
    });

    it("refuses an option the question does not have", () => {
        expect(
            resolveAnswers(QUESTIONS, [
                { kind: "option", option: 2 },
                { kind: "option", option: 0 },
            ])
        ).toEqual({ ok: false });
    });

    it("refuses to answer when there is no question", () => {
        expect(resolveAnswers([], [])).toEqual({ ok: false });
    });
});

describe("answerQuestionsInputSchema", () => {
    const valid = {
        questionEventId: "event-1",
        answers: [{ kind: "option", option: 0 }],
    };

    it("accepts an option or a free text", () => {
        expect(answerQuestionsInputSchema.safeParse(valid).success).toBe(true);
        expect(
            answerQuestionsInputSchema.safeParse({
                ...valid,
                answers: [{ kind: "text", text: "  outra resposta  " }],
            }).data?.answers[0]
        ).toEqual({ kind: "text", text: "outra resposta" });
    });

    it("refuses an empty or too long text", () => {
        for (const text of ["   ", "x".repeat(MAX_ANSWER_TEXT + 1)]) {
            expect(
                answerQuestionsInputSchema.safeParse({
                    ...valid,
                    answers: [{ kind: "text", text }],
                }).success
            ).toBe(false);
        }
    });

    it("refuses more than four answers and an option above 3", () => {
        expect(
            answerQuestionsInputSchema.safeParse({
                ...valid,
                answers: Array.from({ length: 5 }, () => ({
                    kind: "option",
                    option: 0,
                })),
            }).success
        ).toBe(false);
        expect(
            answerQuestionsInputSchema.safeParse({
                ...valid,
                answers: [{ kind: "option", option: 4 }],
            }).success
        ).toBe(false);
    });

    it("refuses a missing question event", () => {
        expect(
            answerQuestionsInputSchema.safeParse({
                ...valid,
                questionEventId: "",
            }).success
        ).toBe(false);
    });
});

describe("cardCommentInputSchema", () => {
    it("trims the comment", () => {
        expect(
            cardCommentInputSchema.parse({ markdown: "  oi  " }).markdown
        ).toBe("oi");
    });

    it("refuses only spaces and anything above the markdown limit", () => {
        expect(
            cardCommentInputSchema.safeParse({ markdown: "  \n " }).success
        ).toBe(false);
        expect(
            cardCommentInputSchema.safeParse({
                markdown: "x".repeat(MAX_MARKDOWN + 1),
            }).success
        ).toBe(false);
    });
});

describe("displayCardState", () => {
    it("shows waiting_input while questions are pending, whatever the state", () => {
        expect(
            displayCardState({
                state: "idle",
                pendingAsk: { eventId: "e", stageKey: "analyze", count: 2 },
            })
        ).toBe("waiting_input");
    });

    it("shows the stored state otherwise", () => {
        expect(displayCardState({ state: "failed", pendingAsk: null })).toBe(
            "failed"
        );
    });
});
