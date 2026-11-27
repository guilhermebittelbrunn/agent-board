import { globalTranslations } from "@repo/internationalization/translations/global";
import { parseBoardConfig } from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardColumns } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardColumns";
import { groupCardsByColumn } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/groupCardsByColumn";

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;

const config = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [
        { key: "analyze", column: "Análise", command: "/analyze" },
        { key: "develop", column: "Executando", command: "/develop" },
    ],
}).data;
if (!config) {
    throw new Error("invalid config");
}

const card = (slug: string, overrides: Partial<CardDTO> = {}): CardDTO => ({
    id: `b__${slug}`,
    boardId: "b",
    slug,
    title: `Título ${slug}`,
    spec: { path: `specs/${slug}.md`, sha: "x", status: "approved", ref: null },
    ready: true,
    orphan: false,
    lane: "tasks",
    origin: "repository",
    request: null,
    specApproval: null,
    stageKey: null,
    state: "idle",
    pendingAsk: null,
    activeRunId: null,
    lastRun: null,
    pullRequest: null,
    pullRequestError: null,
    reworkLoops: 0,
    order: 0,
    branch: null,
    movedAt: null,
    syncedAt: "2026-11-26T10:00:00.000Z",
    createdAt: "2026-11-26T10:00:00.000Z",
    updatedAt: "2026-11-26T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
});

const CARDS = [
    card("search", { order: 0 }),
    card("shortcuts", { order: 1 }),
    card("dark", { order: 2 }),
    card("running", {
        lane: "stage",
        stageKey: "analyze",
        branch: "feat/running",
    }),
];

const draw = (canPrioritize = true, canTrigger = true, cards = CARDS) => {
    const onMove = vi.fn();
    const onReorder = vi.fn();
    render(
        <BoardColumns
            boardsDictionary={boardsDictionary}
            canPrioritize={canPrioritize}
            canTrigger={canTrigger}
            cardHref={(slug) => `/boards/b/cards/${slug}`}
            columns={groupCardsByColumn(cards, config).columns}
            onMove={onMove}
            onReorder={onReorder}
        />
    );
    return { onMove, onReorder };
};

const draggableOf = (title: string) => {
    const element = screen
        .getByRole("link", { name: title })
        .closest("[draggable]");
    if (!element) {
        throw new Error(`no draggable card for ${title}`);
    }
    return element;
};

const ANALYSIS_COLUMN = /^Análise/;
const CARD_MENU_TRIGGER = /^Ações de/;

const columnNamed = (name: RegExp) => screen.getByRole("region", { name });

const dataTransfer = () => ({
    setData: vi.fn(),
    getData: vi.fn(),
    effectAllowed: "",
    dropEffect: "",
});

afterEach(cleanup);

describe("BoardColumns dragging", () => {
    it("reorders Tasks when a card is dropped on another card of the queue", () => {
        const { onReorder, onMove } = draw();
        const transfer = dataTransfer();

        fireEvent.dragStart(draggableOf("Título dark"), {
            dataTransfer: transfer,
        });
        fireEvent.dragOver(draggableOf("Título search"), {
            dataTransfer: transfer,
        });
        fireEvent.drop(draggableOf("Título search"), {
            dataTransfer: transfer,
        });

        expect(transfer.setData).toHaveBeenCalledWith("text/plain", "dark");
        expect(onReorder).toHaveBeenCalledTimes(1);
        expect(onReorder.mock.calls[0]?.[0].slug).toBe("dark");
        expect(onReorder.mock.calls[0]?.slice(1)).toEqual([
            ["dark", "search", "shortcuts"],
            0,
        ]);
        expect(onMove).not.toHaveBeenCalled();
    });

    it("asks to trigger the stage a Tasks card is dropped on", () => {
        const { onMove, onReorder } = draw();
        const transfer = dataTransfer();
        const analysis = columnNamed(ANALYSIS_COLUMN);

        fireEvent.dragStart(draggableOf("Título shortcuts"), {
            dataTransfer: transfer,
        });
        fireEvent.dragOver(analysis, { dataTransfer: transfer });

        expect(analysis.className).toContain("bg-accent");
        expect(analysis.className).toContain("ring-primary");

        fireEvent.drop(analysis, { dataTransfer: transfer });

        expect(onMove).toHaveBeenCalledTimes(1);
        expect(onMove.mock.calls[0]?.[0].slug).toBe("shortcuts");
        expect(onMove.mock.calls[0]?.[1].target).toEqual({
            lane: "stage",
            stageKey: "analyze",
        });
        expect(onReorder).not.toHaveBeenCalled();
        expect(analysis.className).not.toContain("bg-accent");
    });

    it("ignores a drop on the column the card is already in", () => {
        const { onMove } = draw();
        const transfer = dataTransfer();
        const analysis = columnNamed(ANALYSIS_COLUMN);

        fireEvent.dragStart(draggableOf("Título running"), {
            dataTransfer: transfer,
        });
        fireEvent.dragOver(analysis, { dataTransfer: transfer });

        expect(analysis.className).not.toContain("bg-accent");

        fireEvent.drop(analysis, { dataTransfer: transfer });

        expect(onMove).not.toHaveBeenCalled();
    });

    it("sends a stage card dropped on a Tasks card back to Tasks", () => {
        const { onMove, onReorder } = draw();
        const transfer = dataTransfer();

        fireEvent.dragStart(draggableOf("Título running"), {
            dataTransfer: transfer,
        });
        fireEvent.drop(draggableOf("Título search"), {
            dataTransfer: transfer,
        });

        expect(onReorder).not.toHaveBeenCalled();
        expect(onMove.mock.calls[0]?.[1].target).toEqual({ lane: "tasks" });
    });

    it("refuses drops on stage columns when no stage can be triggered", () => {
        const { onMove } = draw(true, false);
        const transfer = dataTransfer();
        const analysis = columnNamed(ANALYSIS_COLUMN);

        fireEvent.dragStart(draggableOf("Título shortcuts"), {
            dataTransfer: transfer,
        });
        fireEvent.dragOver(analysis, { dataTransfer: transfer });
        fireEvent.drop(analysis, { dataTransfer: transfer });

        expect(analysis.className).not.toContain("bg-accent");
        expect(onMove).not.toHaveBeenCalled();
    });

    it("keeps a card with a live run in place: not draggable and without the menu", () => {
        draw(true, true, [
            ...CARDS,
            card("live", {
                lane: "stage",
                stageKey: "develop",
                state: "running",
                activeRunId: "r1",
            }),
        ]);

        expect(draggableOf("Título live").getAttribute("draggable")).toBe(
            "false"
        );
        expect(
            screen.queryByRole("button", { name: "Ações de Título live" })
        ).toBeNull();
        expect(
            screen.getByRole("button", { name: "Ações de Título running" })
        ).toBeTruthy();
    });

    it("leaves cards undraggable and without the menu for a role that cannot prioritize", () => {
        draw(false);

        expect(draggableOf("Título search").getAttribute("draggable")).toBe(
            "false"
        );
        expect(
            screen.queryByRole("button", { name: CARD_MENU_TRIGGER })
        ).toBeNull();
    });
});

describe("CardMoveMenu", () => {
    const openMenuOf = async (title: string) => {
        fireEvent.click(
            screen.getByRole("button", { name: `Ações de ${title}` })
        );
        return await screen.findByRole("menu");
    };

    it("offers only the moves that change the first card of Tasks", async () => {
        draw();
        const menu = await openMenuOf("Título search");
        const labels = within(menu)
            .getAllByRole("menuitem")
            .map((item) => item.textContent);

        expect(labels).toEqual([
            "Descer",
            "Mover para Análise",
            "Mover para Executando",
            "Mover para Concluído",
        ]);
    });

    it("leaves the stage columns out of the menu when no stage can be triggered", async () => {
        draw(true, false);
        const menu = await openMenuOf("Título search");
        const labels = within(menu)
            .getAllByRole("menuitem")
            .map((item) => item.textContent);

        expect(labels).toEqual(["Descer", "Mover para Concluído"]);
    });

    it("reorders and moves from the menu", async () => {
        const { onMove, onReorder } = draw();
        let menu = await openMenuOf("Título dark");

        expect(
            within(menu)
                .getAllByRole("menuitem")
                .map((item) => item.textContent)
        ).toEqual([
            "Mover para o topo",
            "Subir",
            "Mover para Análise",
            "Mover para Executando",
            "Mover para Concluído",
        ]);

        fireEvent.click(within(menu).getByText("Mover para o topo"));
        expect(onReorder.mock.calls[0]?.slice(1)).toEqual([
            ["dark", "search", "shortcuts"],
            0,
        ]);

        cleanup();
        const second = draw();
        menu = await openMenuOf("Título running");
        const labels = within(menu)
            .getAllByRole("menuitem")
            .map((item) => item.textContent);

        expect(labels).toEqual([
            "Mover para Tarefas",
            "Mover para Executando",
            "Mover para Concluído",
        ]);

        fireEvent.click(within(menu).getByText("Mover para Executando"));
        expect(second.onMove.mock.calls[0]?.[1].target).toEqual({
            lane: "stage",
            stageKey: "develop",
        });
        expect(onMove).not.toHaveBeenCalled();
    });

    it("puts the keyboard focus back on the card's menu after it moves", async () => {
        const columnsOf = (cards: CardDTO[]) =>
            groupCardsByColumn(cards, config).columns;
        const props = {
            boardsDictionary,
            canPrioritize: true,
            canTrigger: true,
            cardHref: (slug: string) => `/boards/b/cards/${slug}`,
            onMove: vi.fn(),
            onReorder: vi.fn(),
        };
        const { rerender } = render(
            <BoardColumns {...props} columns={columnsOf(CARDS)} />
        );

        const menu = await openMenuOf("Título shortcuts");
        fireEvent.click(within(menu).getByText("Mover para Análise"));
        const moved = CARDS.map((item) =>
            item.slug === "shortcuts"
                ? {
                      ...item,
                      lane: "stage" as const,
                      stageKey: "analyze",
                      movedAt: "2026-11-26T11:00:00.000Z",
                  }
                : item
        );
        rerender(<BoardColumns {...props} columns={columnsOf(moved)} />);

        const trigger = within(columnNamed(ANALYSIS_COLUMN)).getByRole(
            "button",
            { name: "Ações de Título shortcuts" }
        );
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
});
