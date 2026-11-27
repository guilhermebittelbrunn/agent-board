import { globalTranslations } from "@repo/internationalization/translations/global";
import type { CardDTO } from "@repo/sdk/src/types";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ApproveSpecButton,
    DiscardDraftButton,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/SpecDraftActions";
import { runCard } from "./runCardFixtures";

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;
const APPROVE = "Aprovar spec e mandar para Tarefas";

const SUCCESSFUL_ROUND = {
    id: "run-1",
    stageKey: "spec",
    status: "finished" as const,
    outcome: "success" as const,
    endReason: null,
    stoppedByLogin: null,
    finishedAt: "2026-11-27T09:00:00.000Z",
};

const draft = (overrides: Partial<CardDTO> = {}): CardDTO =>
    runCard("slack-alerts", {
        lane: "drafts",
        stageKey: "spec",
        origin: "board",
        ready: false,
        lastRun: SUCCESSFUL_ROUND,
        ...overrides,
    });

const approveButton = () =>
    screen.getByRole("button", { name: APPROVE }) as HTMLButtonElement;

const drawApprove = (card: CardDTO) => {
    const onApprove = vi.fn();
    render(
        <ApproveSpecButton
            boardsDictionary={boardsDictionary}
            card={card}
            isPending={false}
            onApprove={onApprove}
        />
    );
    return { onApprove };
};

afterEach(cleanup);

describe("ApproveSpecButton", () => {
    it("approves a draft whose last round succeeded with nothing open", () => {
        const card = draft();
        const { onApprove } = drawApprove(card);

        expect(approveButton().disabled).toBe(false);
        fireEvent.click(approveButton());
        expect(onApprove).toHaveBeenCalledWith(card);
    });

    it.each([
        [
            "an open question",
            {
                state: "waiting_input" as const,
                pendingAsk: { eventId: "e1", stageKey: "spec", count: 1 },
            },
            "Libera quando não houver perguntas abertas",
        ],
        [
            "a round still running",
            { state: "running" as const, activeRunId: "run-2" },
            "Libera quando a rodada atual terminar",
        ],
        [
            "a failed round",
            {
                state: "failed" as const,
                lastRun: { ...SUCCESSFUL_ROUND, outcome: "failed" as const },
            },
            "A última rodada falhou. Rode de novo antes de aprovar.",
        ],
        [
            "no finished round",
            { lastRun: null },
            "A escrita ainda não terminou uma rodada. Rode de novo para começar.",
        ],
    ])("stays disabled with the reason for %s", (_label, overrides, hint) => {
        drawApprove(draft(overrides));

        expect(approveButton().disabled).toBe(true);
        expect(screen.getByText(hint)).toBeTruthy();
    });
});

describe("DiscardDraftButton", () => {
    it("names the branch in the confirmation and discards on confirm", async () => {
        const card = draft();
        const onDiscard = vi.fn().mockResolvedValue(undefined);
        render(
            <DiscardDraftButton
                boardsDictionary={boardsDictionary}
                card={card}
                isPending={false}
                onDiscard={onDiscard}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Descartar rascunho" })
        );
        expect(
            screen.getByText(
                "O card sai do quadro. A branch feat/slack-alerts continua no GitHub com o que o agente já gravou."
            )
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

        expect(onDiscard).toHaveBeenCalledWith(card);
        await waitFor(() =>
            expect(screen.queryByText("Descartar este rascunho?")).toBeNull()
        );
    });

    it("keeps the dialog open when discarding fails", async () => {
        const onDiscard = vi.fn().mockRejectedValue(new Error("409"));
        render(
            <DiscardDraftButton
                boardsDictionary={boardsDictionary}
                card={draft()}
                isPending={false}
                onDiscard={onDiscard}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Descartar rascunho" })
        );
        fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

        await waitFor(() => expect(onDiscard).toHaveBeenCalledTimes(1));
        expect(screen.getByText("Descartar este rascunho?")).toBeTruthy();
    });

    it("cannot be opened while a round runs", () => {
        render(
            <DiscardDraftButton
                boardsDictionary={boardsDictionary}
                card={draft({ state: "running", activeRunId: "run-2" })}
                isPending={false}
                onDiscard={vi.fn()}
            />
        );

        const discard = screen.getByRole("button", {
            name: "Descartar rascunho",
        }) as HTMLButtonElement;
        expect(discard.disabled).toBe(true);
    });
});
