import type { BoardRole } from "@repo/kanban-contract";
import type { CycleDetailDTO, CycleDTO } from "@repo/sdk/src/types";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUN_CONFIG, runCard } from "./runCardFixtures";

const BOARD_ID = "b";
const CYCLE_ID = "c1";

const { state, stopMock } = vi.hoisted(() => ({
    state: {
        role: "operator" as BoardRole,
        detail: null as CycleDetailDTO | null,
    },
    stopMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
    useParams: () => ({ locale: "pt-br", id: BOARD_ID, cycleId: CYCLE_ID }),
}));
vi.mock("@/shared/components/ui/Header", () => ({ Header: () => null }));

vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useFindBoardById",
    () => ({
        useFindBoardById: () => ({
            data: {
                id: BOARD_ID,
                name: "sample-app",
                config: RUN_CONFIG,
                access: {
                    role: state.role,
                    githubRole: "admin",
                    effectiveRole: state.role,
                    checkedAt: null,
                },
            },
            isLoading: false,
            error: null,
        }),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useFindBoardCycleById",
    () => ({
        useFindBoardCycleById: () => ({
            data: state.detail,
            isLoading: false,
            error: null,
        }),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCycleCrud",
    () => ({
        useBoardCycleCrud: () => ({
            stopCycleMutation: { isPending: false, mutate: stopMock },
        }),
    })
);

const { CycleDetailClient } = await import(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/cycles/[cycleId]/CycleDetailClient"
);

const cycle = (overrides: Partial<CycleDTO>): CycleDTO => ({
    id: CYCLE_ID,
    boardId: BOARD_ID,
    status: "running",
    endReason: null,
    options: { until: "pull_request", concurrency: 1, onFailure: "skip" },
    items: [
        {
            slug: "alpha",
            title: "Título alpha",
            status: "running",
            code: null,
            startedAt: "2026-11-27T10:00:00.000Z",
            endedAt: null,
        },
    ],
    startedByLogin: "qa-owner",
    stoppedByLogin: null,
    startedAt: "2026-11-27T10:00:00.000Z",
    finishedAt: null,
    createdAt: "2026-11-27T10:00:00.000Z",
    updatedAt: "2026-11-27T10:00:00.000Z",
    ...overrides,
});

const detailOf = (overrides: Partial<CycleDTO> = {}): CycleDetailDTO => ({
    cycle: cycle(overrides),
    cards: [runCard("alpha", { stageKey: "develop", cycleId: CYCLE_ID })],
    decisions: [
        {
            eventId: "e1",
            slug: "alpha",
            stageKey: "analyze",
            at: "2026-11-27T10:01:00.000Z",
            decision: "Nome da coleção no singular",
            rule: "repo_pattern",
            product: false,
        },
        {
            eventId: "e2",
            slug: "alpha",
            stageKey: "analyze",
            at: "2026-11-27T10:02:00.000Z",
            decision: "Rótulo do botão em português",
            rule: "least_impact",
            product: true,
        },
    ],
    activity: [],
});

describe("tela do ciclo", () => {
    beforeEach(() => {
        state.role = "operator";
        state.detail = detailOf();
        stopMock.mockReset();
    });
    afterEach(cleanup);

    it("mostra o andamento e separa a decisão de produto em Para revisar", () => {
        render(<CycleDetailClient />);

        expect(screen.getByRole("table")).toBeTruthy();
        expect(screen.getAllByText("Nome da coleção no singular")).toHaveLength(
            1
        );
        expect(
            screen.getAllByText("Rótulo do botão em português")
        ).toHaveLength(2);
    });

    it("para o ciclo pelo diálogo de confirmação", async () => {
        render(<CycleDetailClient />);

        fireEvent.click(screen.getByRole("button", { name: "Parar o ciclo" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(
            Array.from(dialog.querySelectorAll("button")).find(
                (button) => button.textContent === "Parar o ciclo"
            ) as HTMLElement
        );

        await waitFor(() => expect(stopMock).toHaveBeenCalledTimes(1));
        expect(stopMock.mock.calls[0][0]).toBe(CYCLE_ID);
    });

    it("não oferece parar o ciclo para quem só pode ver o board", () => {
        state.role = "viewer";
        render(<CycleDetailClient />);

        expect(
            screen.queryByRole("button", { name: "Parar o ciclo" })
        ).toBeNull();
    });

    it("não oferece parar um ciclo que já terminou", () => {
        state.detail = detailOf({
            status: "finished",
            endReason: "completed",
            finishedAt: "2026-11-27T10:30:00.000Z",
        });
        render(<CycleDetailClient />);

        expect(
            screen.queryByRole("button", { name: "Parar o ciclo" })
        ).toBeNull();
        expect(
            screen.getByText("Todas as specs saíram do ciclo.")
        ).toBeTruthy();
    });

    it("no ciclo na fila mostra o aviso no lugar do andamento", () => {
        state.detail = detailOf({ status: "queued", startedAt: null });
        render(<CycleDetailClient />);

        expect(screen.queryByRole("table")).toBeNull();
        expect(
            screen.getByText("O andamento aparece quando o ciclo começar.")
        ).toBeTruthy();
    });
});
