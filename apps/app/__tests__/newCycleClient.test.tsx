import type { BoardRole } from "@repo/kanban-contract";
import type { CardDTO, CycleDTO } from "@repo/sdk/src/types";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCard } from "./runCardFixtures";

const BOARD_ID = "b";

const { state, mutateMock } = vi.hoisted(() => ({
    state: {
        role: "operator" as BoardRole,
        cards: [] as CardDTO[],
        cycles: [] as CycleDTO[],
        runners: [] as { online: boolean }[],
    },
    mutateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
    useParams: () => ({ locale: "pt-br", id: BOARD_ID }),
}));
vi.mock("@/shared/components/ui/Header", () => ({ Header: () => null }));

vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useFindBoardById",
    () => ({
        useFindBoardById: () => ({
            data: {
                id: BOARD_ID,
                name: "sample-app",
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
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardCards",
    () => ({
        useListBoardCards: () => ({
            data: state.cards,
            isLoading: false,
            error: null,
        }),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardCycles",
    () => ({
        useListBoardCycles: () => ({ data: state.cycles }),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListRunners",
    () => ({
        useListRunners: () => ({ data: state.runners }),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCycleCrud",
    () => ({
        useBoardCycleCrud: () => ({
            createCycleMutation: { isPending: false, mutate: mutateMock },
        }),
    })
);

const { NewCycleClient } = await import(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/cycles/new/NewCycleClient"
);

const TASKS_ORDER = ["alpha", "beta", "gamma", "queued-elsewhere", "draft"];
const SUBMIT_BUTTON = /Iniciar ciclo/;

const task = (slug: string, overrides: Partial<CardDTO> = {}) =>
    runCard(slug, {
        lane: "tasks",
        stageKey: null,
        order: TASKS_ORDER.indexOf(slug),
        ...overrides,
    });

const liveCycle = (status: CycleDTO["status"], slugs: string[]): CycleDTO => ({
    id: `cycle-${status}`,
    boardId: BOARD_ID,
    status,
    endReason: null,
    options: { until: "pull_request", concurrency: 1, onFailure: "skip" },
    items: slugs.map((slug) => ({
        slug,
        title: slug,
        status: "pending",
        code: null,
        startedAt: null,
        endedAt: null,
    })),
    startedByLogin: "qa-owner",
    stoppedByLogin: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-11-27T10:00:00.000Z",
    updatedAt: "2026-11-27T10:00:00.000Z",
});

const specButton = (slug: string) =>
    screen.queryByRole("button", { name: new RegExp(slug) });

describe("tela Novo ciclo", () => {
    beforeEach(() => {
        // O grupo de rádio do design system observa o próprio tamanho; o jsdom não traz a API.
        globalThis.ResizeObserver ??= class {
            observe() {
                return;
            }
            unobserve() {
                return;
            }
            disconnect() {
                return;
            }
        };
        state.role = "operator";
        state.cards = [
            task("gamma"),
            task("alpha"),
            task("beta"),
            task("queued-elsewhere"),
            task("draft", { ready: false }),
        ];
        state.cycles = [];
        state.runners = [];
        mutateMock.mockReset();
    });
    afterEach(cleanup);

    it("lista só as specs livres, na ordem de Tarefas, e esconde as que estão num ciclo na fila", () => {
        state.cycles = [liveCycle("queued", ["queued-elsewhere"])];
        render(<NewCycleClient />);

        const listed = screen
            .getAllByRole("button", { pressed: false })
            .map((button) => button.textContent ?? "");
        expect(listed).toEqual([
            "Título alphaalpha",
            "Título betabeta",
            "Título gammagamma",
        ]);
        expect(specButton("queued-elsewhere")).toBeNull();
        expect(specButton("draft")).toBeNull();
    });

    it("envia as specs na ordem em que foram escolhidas, com as opções padrão", async () => {
        render(<NewCycleClient />);

        fireEvent.click(specButton("gamma") as HTMLElement);
        fireEvent.click(specButton("alpha") as HTMLElement);
        fireEvent.click(
            screen.getByRole("button", { name: "Iniciar ciclo com 2 specs" })
        );

        await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
        expect(mutateMock.mock.calls[0][0]).toEqual({
            slugs: ["gamma", "alpha"],
            options: {
                until: "pull_request",
                concurrency: 1,
                onFailure: "skip",
            },
        });
    });

    it("não envia sem spec escolhida e mostra a mensagem do dicionário", async () => {
        render(<NewCycleClient />);

        fireEvent.click(
            screen.getByRole("button", { name: "Iniciar ciclo com 0 specs" })
        );

        expect(
            await screen.findByText("Escolha pelo menos uma spec.")
        ).toBeTruthy();
        expect(mutateMock).not.toHaveBeenCalled();
    });

    it("avisa que o ciclo entra na fila quando outro está rodando", () => {
        state.cycles = [liveCycle("running", ["other"])];
        render(<NewCycleClient />);

        expect(
            screen.getByText(
                "Já existe um ciclo rodando. Este entra na fila e começa quando ele terminar."
            )
        ).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Ver ciclo atual" })
                .getAttribute("href")
        ).toContain("cycle-running");
    });

    it("avisa que duas specs ao mesmo tempo pedem dois runners online", () => {
        state.runners = [{ online: true }, { online: false }];
        render(<NewCycleClient />);

        fireEvent.click(screen.getByRole("radio", { name: "Até 2" }));

        expect(
            screen.getByText(
                "Duas specs ao mesmo tempo precisam de dois runners seus online. Agora você tem 1."
            )
        ).toBeTruthy();
    });

    it("não mostra o formulário para quem só pode ver o board", () => {
        state.role = "viewer";
        render(<NewCycleClient />);

        expect(specButton("alpha")).toBeNull();
        expect(
            screen.queryByRole("button", { name: SUBMIT_BUTTON })
        ).toBeNull();
    });
});
