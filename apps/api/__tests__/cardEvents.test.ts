import {
    askInputSchema,
    attachArtifactInputSchema,
    completeStageInputSchema,
    parseBoardConfig,
    postUpdateInputSchema,
} from "@repo/kanban-contract";
import type { CardEventDTO } from "@repo/sdk/src/types";
import { describe, expect, it } from "vitest";
import {
    agentEventFromTool,
    normalizeArtifactPath,
    planAnswer,
} from "@/(shared)/lib/card-events";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";

const config = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;
if (!config) {
    throw new Error("The sample board.yml must parse");
}
const card = {
    id: "board__search-cards",
    boardId: "board",
    lane: "stage" as const,
};
const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const withoutAgent = {
    ...config,
    stages: config.stages.map(({ agent: _agent, ...stage }) => stage),
};

describe("agentEventFromTool", () => {
    it("writes an update with the agent of the stage as author", () => {
        const input = postUpdateInputSchema.parse({
            cardId: card.id,
            stage: "analyze",
            markdown: "Lendo a spec.",
        });

        expect(
            agentEventFromTool({ tool: "post_update", input }, { card, config })
        ).toEqual({
            ok: true,
            write: {
                boardId: "board",
                cardId: card.id,
                stageKey: "analyze",
                lane: "stage",
                author: { kind: "agent", name: "planejador-tarefa" },
                type: "update",
                markdown: "Lendo a spec.",
            },
        });
    });

    it("falls back to the stage command when the stage names no agent", () => {
        const input = postUpdateInputSchema.parse({
            cardId: card.id,
            stage: "develop",
            markdown: "x",
        });
        const result = agentEventFromTool(
            { tool: "post_update", input },
            { card, config: withoutAgent }
        );

        expect(result.ok && result.write.author).toEqual({
            kind: "agent",
            name: "/develop",
        });
    });

    it("keeps the questions of an ask as sent", () => {
        const input = askInputSchema.parse({
            cardId: card.id,
            stage: "analyze",
            questions: [
                {
                    question: "Escopo?",
                    header: "Escopo",
                    options: [{ label: "A" }, { label: "B" }],
                    recommended: 1,
                },
            ],
        });
        const result = agentEventFromTool(
            { tool: "ask", input },
            { card, config }
        );

        expect(result.ok && result.write.type).toBe("question");
        expect(result.ok && result.write.questions).toEqual(input.questions);
    });

    it("turns complete_stage into a report without touching the card", () => {
        const input = completeStageInputSchema.parse({
            cardId: card.id,
            stage: "develop",
            outcome: "needs_rework",
            summary: "### Develop — falhou",
        });
        const result = agentEventFromTool(
            { tool: "complete_stage", input },
            { card, config }
        );

        expect(result.ok && result.write).toMatchObject({
            type: "report",
            outcome: "needs_rework",
            markdown: "### Develop — falhou",
        });
        expect(result.ok && Object.keys(result.write)).not.toContain("state");
    });

    it("normalizes the artifact path and refuses one that leaves the repository", () => {
        const ok = agentEventFromTool(
            {
                tool: "attach_artifact",
                input: attachArtifactInputSchema.parse({
                    cardId: card.id,
                    stage: "analyze",
                    path: "docs//features/x/plan.md",
                    commitSha: SHA,
                }),
            },
            { card, config }
        );
        expect(ok.ok && ok.write.artifact).toEqual({
            path: "docs/features/x/plan.md",
            commitSha: SHA,
        });

        const refused = agentEventFromTool(
            {
                tool: "attach_artifact",
                input: attachArtifactInputSchema.parse({
                    cardId: card.id,
                    stage: "analyze",
                    path: "docs/../../etc/passwd",
                    commitSha: SHA,
                }),
            },
            { card, config }
        );
        expect(refused).toEqual({
            ok: false,
            code: "CARD_ARTIFACT_PATH_INVALID",
        });
    });

    it("refuses a stage that is not in board.yml", () => {
        const input = postUpdateInputSchema.parse({
            cardId: card.id,
            stage: "deploy",
            markdown: "x",
        });

        expect(
            agentEventFromTool({ tool: "post_update", input }, { card, config })
        ).toEqual({ ok: false, code: "CARD_STAGE_NOT_FOUND" });
    });
});

describe("normalizeArtifactPath", () => {
    it.each([
        ["/etc/passwd", null],
        ["../secret", null],
        ["a/./b", null],
        ["a\\b", null],
        ["   ", null],
        ["docs/plan.md/", "docs/plan.md"],
    ])("%s → %s", (path, expected) => {
        expect(normalizeArtifactPath(path)).toBe(expected);
    });
});

describe("planAnswer", () => {
    const question: CardEventDTO = {
        id: "q1",
        boardId: "board",
        cardId: card.id,
        stageKey: "analyze",
        lane: "stage",
        author: { kind: "agent", name: "planejador-tarefa" },
        runId: null,
        createdAt: "",
        updatedAt: "",
        type: "question",
        questions: [
            {
                question: "Escopo?",
                header: "Escopo",
                options: [{ label: "A" }, { label: "B" }],
            },
        ],
        answeredByEventId: null,
    };
    const pending = {
        id: card.id,
        pendingAsk: { eventId: "q1", stageKey: "analyze", count: 1 },
    };

    it("answers the pending questions under their stage", () => {
        expect(
            planAnswer({
                card: pending,
                question,
                questionEventId: "q1",
                answers: [{ kind: "option", option: 1 }],
            })
        ).toMatchObject({ ok: true, stageKey: "analyze" });
    });

    it("refuses when the card points at no question or at another one", () => {
        for (const cardState of [
            { ...pending, pendingAsk: null },
            {
                ...pending,
                pendingAsk: { eventId: "q2", stageKey: "analyze", count: 1 },
            },
        ]) {
            expect(
                planAnswer({
                    card: cardState,
                    question,
                    questionEventId: "q1",
                    answers: [{ kind: "option", option: 0 }],
                })
            ).toEqual({ ok: false, code: "CARD_QUESTIONS_NOT_PENDING" });
        }
    });

    it("refuses a question event of another card", () => {
        expect(
            planAnswer({
                card: pending,
                question: { ...question, cardId: "other__card" },
                questionEventId: "q1",
                answers: [{ kind: "option", option: 0 }],
            })
        ).toEqual({ ok: false, code: "CARD_QUESTIONS_NOT_PENDING" });
    });

    it("refuses answers that do not match the questions", () => {
        expect(
            planAnswer({
                card: pending,
                question,
                questionEventId: "q1",
                answers: [{ kind: "option", option: 2 }],
            })
        ).toEqual({ ok: false, code: "CARD_ANSWERS_MISMATCH" });
    });

    it("answers 404 when the card is gone", () => {
        expect(
            planAnswer({
                card: null,
                question,
                questionEventId: "q1",
                answers: [],
            })
        ).toEqual({ ok: false, code: "CARD_NOT_FOUND" });
    });
});
