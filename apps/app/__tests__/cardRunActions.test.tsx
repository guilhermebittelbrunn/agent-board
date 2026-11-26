import { globalTranslations } from "@repo/internationalization/translations/global";
import type { CardLastRun } from "@repo/kanban-contract";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardRunControls } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CardRunControls";
import { cardRunReason } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/cardRunReason";
import { RUN_CONFIG, runBoard, runCard } from "./runCardFixtures";

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;

const lastRun = (overrides: Partial<CardLastRun> = {}): CardLastRun => ({
    id: "r1",
    stageKey: "analyze",
    status: "finished",
    outcome: "failed",
    endReason: "agent",
    stoppedByLogin: null,
    finishedAt: "2026-11-26T10:00:00.000Z",
    ...overrides,
});

const draw = (
    card: ReturnType<typeof runCard>,
    {
        canTrigger = true,
        executor = "fake",
    }: { canTrigger?: boolean; executor?: "fake" | null } = {}
) => {
    const onCommand = vi.fn();
    render(
        <CardRunControls
            board={runBoard({ executor })}
            boardsDictionary={boardsDictionary}
            canTrigger={canTrigger}
            card={card}
            onCommand={onCommand}
        />
    );
    return { onCommand };
};

const buttonNames = () =>
    screen.queryAllByRole("button").map((button) => button.textContent);

afterEach(cleanup);

describe("CardRunControls", () => {
    it("offers to stop a running card, naming the card for screen readers", () => {
        const card = runCard("live", { state: "running", activeRunId: "r1" });
        const { onCommand } = draw(card);

        expect(buttonNames()).toEqual(["Parar"]);
        fireEvent.click(
            screen.getByRole("button", { name: "Parar: Título live" })
        );
        expect(onCommand).toHaveBeenCalledWith(card, "stop");
    });

    it("offers to run a failed card again, with the timeout as the reason", () => {
        const card = runCard("late", {
            state: "failed",
            lastRun: lastRun({ endReason: "timeout" }),
        });
        const { onCommand } = draw(card);

        expect(
            screen.getByText("O agente não respondeu em 45 min.")
        ).toBeTruthy();
        expect(screen.getByText("Falhou")).toBeTruthy();
        fireEvent.click(
            screen.getByRole("button", { name: "Rodar de novo: Título late" })
        );
        expect(onCommand).toHaveBeenCalledWith(card, "rerun");
    });

    it("offers approval when the previous stage is done and the board asks first", () => {
        const card = runCard("plan", {
            stageKey: "develop",
            lastRun: lastRun({ outcome: "success" }),
        });
        draw(card);

        expect(
            screen.getByText("Plano pronto · aguarda sua aprovação")
        ).toBeTruthy();
        expect(buttonNames()).toEqual(["Aprovar e seguir"]);
    });

    it("shows the rework loop out of the board's limit", () => {
        draw(
            runCard("loop", {
                stageKey: "develop",
                state: "running",
                activeRunId: "r2",
                reworkLoops: 1,
            })
        );

        expect(screen.getByText("Volta 1 de 2")).toBeTruthy();
    });

    it("shows no button to a viewer nor without an executor, but keeps the state", () => {
        const failed = runCard("x", { state: "failed" });
        draw(failed, { canTrigger: false });
        expect(buttonNames()).toEqual([]);
        expect(screen.getByText("Falhou")).toBeTruthy();

        cleanup();
        draw(failed, { executor: null });
        expect(buttonNames()).toEqual([]);
    });
});

describe("cardRunReason", () => {
    const reasonOf = (card: ReturnType<typeof runCard>) =>
        cardRunReason(card, RUN_CONFIG, boardsDictionary);

    it("explains a stopped run and a dispatch that failed", () => {
        expect(
            reasonOf(
                runCard("s", {
                    lastRun: lastRun({
                        status: "stopped",
                        outcome: null,
                        endReason: "stopped",
                        stoppedByLogin: "octo",
                    }),
                })
            )
        ).toBe("Parado por octo.");
        expect(
            reasonOf(
                runCard("d", {
                    state: "failed",
                    lastRun: lastRun({ endReason: "dispatch_failed" }),
                })
            )
        ).toBe("Não foi possível iniciar a etapa.");
    });

    it("says nothing while a run is live or when the agent itself failed", () => {
        expect(
            reasonOf(
                runCard("l", {
                    state: "running",
                    activeRunId: "r2",
                    lastRun: lastRun({ endReason: "timeout" }),
                })
            )
        ).toBeNull();
        expect(
            reasonOf(runCard("a", { state: "failed", lastRun: lastRun() }))
        ).toBeNull();
    });
});
