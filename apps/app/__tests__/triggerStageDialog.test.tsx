import { globalTranslations } from "@repo/internationalization/translations/global";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type TriggerRequest,
    TriggerStageDialog,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/TriggerStageDialog";
import { runBoard, runCard } from "./runCardFixtures";

const AGAIN = /de novo/;
const DROPPED = /soltou/;

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;

const draw = ({
    request = {
        card: runCard("search", { lane: "tasks", stageKey: null }),
        stageKey: "analyze",
        kind: "drag",
    } as TriggerRequest,
    board = runBoard(),
    cards = [] as ReturnType<typeof runCard>[],
} = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
        <TriggerStageDialog
            board={board}
            boardsDictionary={boardsDictionary}
            cards={cards}
            isPending={false}
            onCancel={onCancel}
            onConfirm={onConfirm}
            request={request}
        />
    );
    return { onConfirm, onCancel, request };
};

afterEach(cleanup);

describe("TriggerStageDialog", () => {
    it("shows the command with the slug, the model, the card's branch and the turn limit", () => {
        draw();

        expect(screen.getByText("Disparar a etapa Análise?")).toBeTruthy();
        expect(screen.getByText("/analyze search")).toBeTruthy();
        expect(screen.getByText("opus · alto")).toBeTruthy();
        expect(screen.getByText("feat/search")).toBeTruthy();
        expect(screen.getByText("200 turnos")).toBeTruthy();
        expect(
            screen.getByText("Executor de teste: o resultado é simulado.")
        ).toBeTruthy();
    });

    it("warns that the card waits when the column is at its limit", () => {
        draw({
            board: runBoard({
                stageSettings: {
                    analyze: { wipLimit: 1, approvalGate: false },
                },
            }),
            cards: [runCard("busy", { state: "running", activeRunId: "r1" })],
        });

        expect(
            screen.getByText(
                "A coluna Análise já tem o máximo de cards rodando (1). O card entra na fila e começa quando uma vaga abrir."
            )
        ).toBeTruthy();
    });

    it("triggers on confirm and does nothing on cancel", () => {
        const { onConfirm, onCancel, request } = draw();

        fireEvent.click(
            screen.getByRole("button", { name: "Cancelar e voltar o card" })
        );
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();

        fireEvent.click(
            screen.getByRole("button", { name: "Disparar Análise" })
        );
        expect(onConfirm).toHaveBeenCalledWith(request);
    });

    it("titles a rerun and an approval for what they do", () => {
        const card = runCard("search");
        draw({ request: { card, stageKey: "analyze", kind: "rerun" } });
        expect(screen.getByText("Rodar Análise de novo?")).toBeTruthy();

        cleanup();
        draw({ request: { card, stageKey: "develop", kind: "approve" } });
        expect(
            screen.getByText("Aprovar e seguir para Executando?")
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Aprovar e seguir" })
        ).toBeTruthy();
        expect(screen.queryByText(AGAIN)).toBeNull();
    });

    it("describes the move without assuming it was a drag", () => {
        draw();

        expect(screen.queryByText(DROPPED)).toBeNull();
        expect(
            screen.getByText(
                "“Título search” entra em Análise. O agente roda a etapa na branch do card e escreve o resultado no card."
            )
        ).toBeTruthy();
    });
});
