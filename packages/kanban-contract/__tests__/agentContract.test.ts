import { describe, expect, it } from "vitest";
import {
    askInputSchema,
    attachArtifactInputSchema,
    type Question,
    questionSchema,
} from "../src/agentContract";

const SHA_LENGTH = 40;
const SHA = "a".repeat(SHA_LENGTH);
const MAX_QUESTION = 1000;
const MAX_HEADER = 24;
const MAX_OPTION_LABEL = 120;
const MAX_OPTION_DESCRIPTION = 500;
const MAX_ARTIFACT_PATH = 1024;
const MAX_OPTIONS = 4;
const LAST_OPTION = MAX_OPTIONS - 1;

const question = (overrides: Partial<Question> = {}): Question => ({
    question: "A busca considera o corpo da spec?",
    header: "Escopo",
    options: [{ label: "Só o título" }, { label: "Título e corpo" }],
    ...overrides,
});

describe("questionSchema", () => {
    it("accepts a question of 1000 characters and rejects one of 1001", () => {
        expect(
            questionSchema.safeParse(
                question({ question: "q".repeat(MAX_QUESTION) })
            ).success
        ).toBe(true);
        expect(
            questionSchema.safeParse(
                question({ question: "q".repeat(MAX_QUESTION + 1) })
            ).success
        ).toBe(false);
    });

    it("accepts an option label of 120 characters and rejects one of 121", () => {
        const withLabel = (label: string) =>
            question({ options: [{ label }, { label: "Outra" }] });

        expect(
            questionSchema.safeParse(withLabel("l".repeat(MAX_OPTION_LABEL)))
                .success
        ).toBe(true);
        expect(
            questionSchema.safeParse(
                withLabel("l".repeat(MAX_OPTION_LABEL + 1))
            ).success
        ).toBe(false);
    });

    it("accepts an option description of 500 characters and rejects one of 501", () => {
        const withDescription = (description: string) =>
            question({
                options: [{ label: "Uma", description }, { label: "Outra" }],
            });

        expect(
            questionSchema.safeParse(
                withDescription("d".repeat(MAX_OPTION_DESCRIPTION))
            ).success
        ).toBe(true);
        expect(
            questionSchema.safeParse(
                withDescription("d".repeat(MAX_OPTION_DESCRIPTION + 1))
            ).success
        ).toBe(false);
    });

    it("rejects an empty question and an empty option label", () => {
        expect(
            questionSchema.safeParse(question({ question: "" })).success
        ).toBe(false);
        expect(
            questionSchema.safeParse(
                question({ options: [{ label: "" }, { label: "Outra" }] })
            ).success
        ).toBe(false);
    });

    it("accepts an ask with four questions at every limit", () => {
        const atLimit = question({
            question: "q".repeat(MAX_QUESTION),
            header: "h".repeat(MAX_HEADER),
            options: Array.from({ length: MAX_OPTIONS }, (_, index) => ({
                label: `${index}`.padEnd(MAX_OPTION_LABEL, "l"),
                description: "d".repeat(MAX_OPTION_DESCRIPTION),
            })),
            recommended: LAST_OPTION,
        });

        expect(
            askInputSchema.safeParse({
                cardId: "card",
                stage: "analyze",
                questions: [atLimit, atLimit, atLimit, atLimit],
            }).success
        ).toBe(true);
    });
});

describe("attachArtifactInputSchema", () => {
    const artifact = (path: string) => ({
        cardId: "card",
        stage: "analyze",
        path,
        commitSha: SHA,
    });

    it("accepts a path of 1024 characters and rejects one of 1025", () => {
        expect(
            attachArtifactInputSchema.safeParse(
                artifact("p".repeat(MAX_ARTIFACT_PATH))
            ).success
        ).toBe(true);
        expect(
            attachArtifactInputSchema.safeParse(
                artifact("p".repeat(MAX_ARTIFACT_PATH + 1))
            ).success
        ).toBe(false);
    });

    it("rejects an empty path", () => {
        expect(attachArtifactInputSchema.safeParse(artifact("")).success).toBe(
            false
        );
    });
});
