import { globalTranslations } from "@repo/internationalization/translations/global";
import type { CardDTO } from "@repo/sdk/src/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftCardControls } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/DraftCardControls";
import { runCard } from "./runCardFixtures";

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;

const SUCCESSFUL_ROUND = {
    id: "run-1",
    stageKey: "spec",
    status: "finished" as const,
    outcome: "success" as const,
    endReason: null,
    stoppedByLogin: null,
    finishedAt: "2026-11-27T09:00:00.000Z",
};

const REQUEST: NonNullable<CardDTO["request"]> = {
    text: "Quero aviso no Slack",
    attachments: [],
    requestedBy: { userId: "u1", login: "octo" },
    requestedAt: "2026-11-27T08:00:00.000Z",
};

const draft = (overrides: Partial<CardDTO> = {}): CardDTO =>
    runCard("slack-alerts", {
        lane: "drafts",
        stageKey: "spec",
        origin: "board",
        ready: false,
        request: REQUEST,
        ...overrides,
    });

const attachment = (id: string) => ({
    id,
    name: `${id}.png`,
    contentType: "image/png" as const,
    size: 1024,
});

const draw = (card: CardDTO, canApprove = true) => {
    const onApprove = vi.fn();
    render(
        <DraftCardControls
            boardsDictionary={boardsDictionary}
            canApprove={canApprove}
            card={card}
            href="/pt-br/boards/b/cards/slack-alerts"
            isApproving={false}
            onApprove={onApprove}
        />
    );
    return { onApprove };
};

afterEach(cleanup);

describe("DraftCardControls", () => {
    it("shows Escrevendo while the round runs, with no action", () => {
        draw(draft({ state: "running", activeRunId: "run-2" }));

        expect(screen.getByText("Escrevendo")).toBeTruthy();
        expect(screen.getByText("Escrita a partir de texto")).toBeTruthy();
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("links to the card to answer when a question is open", () => {
        draw(
            draft({
                state: "waiting_input",
                pendingAsk: { eventId: "e1", stageKey: "spec", count: 2 },
            })
        );

        expect(screen.getByText("Aguardando você")).toBeTruthy();
        const answer = screen.getByRole("link", { name: "Responder" });
        expect(answer.getAttribute("href")).toBe(
            "/pt-br/boards/b/cards/slack-alerts"
        );
        expect(
            screen.queryByRole("button", { name: "Aprovar spec" })
        ).toBeNull();
    });

    it("offers approve and read once the spec is ready", () => {
        const card = draft({ lastRun: SUCCESSFUL_ROUND });
        const { onApprove } = draw(card);

        expect(screen.getByText("Spec pronta")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Aprovar spec" }));
        expect(onApprove).toHaveBeenCalledWith(card);
        expect(screen.getByRole("link", { name: "Ler" })).toBeTruthy();
    });

    it("hides approve from someone who cannot prioritize, keeping read", () => {
        draw(draft({ lastRun: SUCCESSFUL_ROUND }), false);

        expect(
            screen.queryByRole("button", { name: "Aprovar spec" })
        ).toBeNull();
        expect(screen.getByRole("link", { name: "Ler" })).toBeTruthy();
    });

    it("marks a failed round and offers nothing to approve", () => {
        draw(
            draft({
                state: "failed",
                lastRun: { ...SUCCESSFUL_ROUND, outcome: "failed" },
            })
        );

        expect(screen.getByText("Falhou")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("counts the attachments in the origin line", () => {
        draw(
            draft({
                request: {
                    ...REQUEST,
                    attachments: [attachment("a")],
                },
            })
        );
        expect(
            screen.getByText("Escrita a partir de texto e 1 anexo")
        ).toBeTruthy();

        cleanup();
        draw(
            draft({
                request: {
                    ...REQUEST,
                    attachments: [attachment("a"), attachment("b")],
                },
            })
        );
        expect(
            screen.getByText("Escrita a partir de texto e 2 anexos")
        ).toBeTruthy();
    });
});
