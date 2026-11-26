import { getDictionary } from "@repo/internationalization/client";
import { parseBoardConfig, type Question } from "@repo/kanban-contract";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardQuestions } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CardQuestions";

// Radix radio groups measure their items; jsdom has no ResizeObserver.
class NoopObserver {
    observe() {
        return;
    }
    unobserve() {
        return;
    }
    disconnect() {
        return;
    }
}
globalThis.ResizeObserver ??=
    NoopObserver as unknown as typeof globalThis.ResizeObserver;

const config = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [{ key: "analyze", column: "Análise", command: "/analyze" }],
}).data;
if (!config) {
    throw new Error("invalid config");
}

const QUESTIONS: Question[] = [
    {
        question: "A busca considera o corpo da spec?",
        header: "Escopo",
        options: [
            { label: "Só o título", description: "Mais rápida." },
            { label: "Título e corpo" },
        ],
        recommended: 0,
    },
    {
        question: "Qual atalho abre a busca?",
        header: "Atalho",
        options: [{ label: "Ctrl+K" }, { label: "/" }],
    },
];

const boardsDictionary =
    getDictionary().dictionary.apps.app.pages.common.boards;
const questionsCopy = boardsDictionary.cardDetail.questions;

function draw(canAnswer = true, resumes = false) {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(
        <CardQuestions
            boardsDictionary={boardsDictionary}
            canAnswer={canAnswer}
            config={config as NonNullable<typeof config>}
            isSubmitting={false}
            onAnswer={onAnswer}
            questions={QUESTIONS}
            resumes={resumes}
            stageKey="analyze"
        />
    );
    return onAnswer;
}

const radio = (name: string) =>
    screen.getByRole("radio", { name: new RegExp(`^${name}`) });
const otherRadios = () =>
    screen.getAllByRole("radio", {
        name: new RegExp(`^${questionsCopy.other}`),
    });

afterEach(cleanup);

describe("CardQuestions", () => {
    it("titles the block with the stage column and the count", () => {
        draw();

        expect(
            screen.getByRole("heading", {
                name: "A etapa Análise parou com 2 perguntas",
            })
        ).toBeTruthy();
    });

    it("starts with the recommended option checked and nothing on the other question", () => {
        draw();

        expect(radio("Só o título").getAttribute("aria-checked")).toBe("true");
        expect(radio("Ctrl\\+K").getAttribute("aria-checked")).toBe("false");
        expect(radio("/").getAttribute("aria-checked")).toBe("false");
        expect(screen.getByText(questionsCopy.recommended)).toBeTruthy();
    });

    it("refuses to send without a choice on every question", async () => {
        const onAnswer = draw();

        fireEvent.click(
            screen.getByRole("button", { name: questionsCopy.submit })
        );

        expect(await screen.findByText(questionsCopy.required)).toBeTruthy();
        expect(onAnswer).not.toHaveBeenCalled();
    });

    it("asks for the text when writing another answer, then sends it", async () => {
        const onAnswer = draw();

        fireEvent.click(otherRadios()[1] as HTMLElement);
        const textarea = await screen.findByLabelText(
            new RegExp(questionsCopy.otherLabel.replace("{number}", "2"))
        );
        fireEvent.click(
            screen.getByRole("button", { name: questionsCopy.submit })
        );
        expect(
            await screen.findByText(questionsCopy.textRequired)
        ).toBeTruthy();
        expect(onAnswer).not.toHaveBeenCalled();

        fireEvent.change(textarea, {
            target: { value: "  Usar o atalho /  " },
        });
        fireEvent.click(
            screen.getByRole("button", { name: questionsCopy.submit })
        );

        await waitFor(() =>
            expect(onAnswer).toHaveBeenCalledWith([
                { kind: "option", option: 0 },
                { kind: "text", text: "Usar o atalho /" },
            ])
        );
    });

    it("says the stage runs again on submit when an executor can run it", () => {
        draw(true, true);

        expect(
            screen.getByRole("button", {
                name: "Responder e retomar a etapa Análise",
            })
        ).toBeTruthy();
    });

    it("shows the questions without choices to someone who cannot answer", () => {
        draw(false);

        expect(screen.queryAllByRole("radio")).toHaveLength(0);
        expect(
            screen.queryByRole("button", { name: questionsCopy.submit })
        ).toBeNull();
        expect(screen.getByText(questionsCopy.readOnly)).toBeTruthy();
        expect(screen.getByText("Título e corpo")).toBeTruthy();
    });
});
