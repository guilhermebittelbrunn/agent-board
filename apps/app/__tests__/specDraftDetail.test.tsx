import { globalTranslations } from "@repo/internationalization/translations/global";
import type { BoardRole } from "@repo/kanban-contract";
import type { BoardViewDTO, CardDTO } from "@repo/sdk/src/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBoard, runCard } from "./runCardFixtures";

const { panelMock, specMock, eventsMock } = vi.hoisted(() => ({
    panelMock: vi.fn(),
    specMock: vi.fn(),
    eventsMock: vi.fn(),
}));

vi.mock("@/shared/providers/AuthRequestPanelContext", () => ({
    useAuthRequestPanel: () => panelMock(),
}));
vi.mock("@/shared/lib/client", () => ({ apiClient: {} }));
vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({ successAlert: vi.fn(), errorAlert: vi.fn() }),
}));
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useFindCardSpecBySlug",
    () => ({ useFindCardSpecBySlug: () => specMock() })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListCardEvents",
    () => ({ useListCardEvents: () => eventsMock() })
);

const { SpecDraftDetail } = await import(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/SpecDraftDetail"
);

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;
const APPROVE = "Aprovar spec e mandar para Tarefas";
const DISCARD = "Descartar rascunho";

const board = (role: BoardRole) =>
    ({
        ...runBoard(),
        id: "b",
        storageAvailable: true,
        repository: {
            installationId: 1,
            owner: "agent-board-demo",
            name: "sample-app",
            fullName: "agent-board-demo/sample-app",
            defaultBranch: "main",
            private: false,
        },
        access: {
            role,
            githubRole: "admin",
            effectiveRole: role,
            checkedAt: null,
        },
    }) as BoardViewDTO;

const draft = (overrides: Partial<CardDTO> = {}): CardDTO =>
    runCard("aviso-no-slack", {
        lane: "drafts",
        stageKey: "spec",
        origin: "board",
        ready: false,
        spec: {
            path: "specs/features/aviso-no-slack.md",
            sha: "",
            status: "proposed",
            ref: "feat/aviso-no-slack",
        },
        branch: "feat/aviso-no-slack",
        request: {
            text: "Quero aviso no Slack quando um card parar",
            attachments: [
                {
                    id: "a1",
                    name: "conversa.png",
                    contentType: "image/png",
                    size: 2048,
                },
            ],
            requestedBy: { userId: "u1", login: "octo" },
            requestedAt: "2026-11-27T08:00:00.000Z",
        },
        lastRun: {
            id: "run-1",
            stageKey: "spec",
            status: "finished",
            outcome: "success",
            endReason: null,
            stoppedByLogin: null,
            finishedAt: "2026-11-27T09:00:00.000Z",
        },
        ...overrides,
    });

const draw = (role: BoardRole, card = draft()) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={queryClient}>
            <SpecDraftDetail
                activity={<p>atividade</p>}
                board={board(role)}
                boardsDictionary={boardsDictionary}
                card={card}
                onDiscarded={vi.fn()}
                onRunCommand={vi.fn()}
            />
        </QueryClientProvider>
    );
};

beforeEach(() => {
    panelMock.mockReturnValue({ isImpersonating: false });
    specMock.mockReturnValue({
        data: {
            path: "specs/features/aviso-no-slack.md",
            ref: "feat/aviso-no-slack",
            sha: "abc",
            content: "# Aviso no Slack\n\nCorpo do rascunho.",
        },
        isLoading: false,
        error: null,
    });
    eventsMock.mockReturnValue({ data: [] });
});
afterEach(cleanup);

describe("SpecDraftDetail", () => {
    it("shows the request, its attachment, the branch and the draft from the card branch", () => {
        draw("operator");

        expect(screen.getByText("Seu pedido")).toBeTruthy();
        expect(
            screen.getByText("Quero aviso no Slack quando um card parar")
        ).toBeTruthy();
        expect(screen.getByText("conversa.png")).toBeTruthy();
        expect(screen.getByText("feat/aviso-no-slack")).toBeTruthy();
        expect(screen.getByText("Aviso no Slack")).toBeTruthy();
        expect(screen.getByText("Spec pronta")).toBeTruthy();
        expect(screen.queryByText("Parado")).toBeNull();
    });

    it("gives an operator approve and discard", () => {
        draw("operator");

        expect(screen.getByRole("button", { name: APPROVE })).toBeTruthy();
        expect(screen.getByRole("button", { name: DISCARD })).toBeTruthy();
    });

    it("hides approve and discard from a viewer", () => {
        draw("viewer");

        expect(screen.queryByRole("button", { name: APPROVE })).toBeNull();
        expect(screen.queryByRole("button", { name: DISCARD })).toBeNull();
        expect(screen.getByText("Seu pedido")).toBeTruthy();
    });

    it("hides approve and discard while an admin impersonates", () => {
        panelMock.mockReturnValue({ isImpersonating: true });
        draw("owner");

        expect(screen.queryByRole("button", { name: APPROVE })).toBeNull();
        expect(screen.queryByRole("button", { name: DISCARD })).toBeNull();
    });

    it("says the draft is not on the branch yet when the file is missing", () => {
        specMock.mockReturnValue({
            data: {
                path: "specs/features/aviso-no-slack.md",
                ref: "feat/aviso-no-slack",
                sha: null,
                content: null,
            },
            isLoading: false,
            error: null,
        });
        draw("operator", draft({ lastRun: null }));

        expect(
            screen.getByText(
                "O agente ainda não gravou o rascunho na branch feat/aviso-no-slack."
            )
        ).toBeTruthy();
    });

    it("counts the question rounds of the spec stage", () => {
        eventsMock.mockReturnValue({
            data: [
                { id: "q1", type: "question", stageKey: "spec" },
                { id: "q2", type: "question", stageKey: "spec" },
                { id: "c1", type: "comment", stageKey: null },
            ],
        });
        draw("operator");

        expect(
            screen.getByText("em Rascunhos · 2ª rodada de perguntas")
        ).toBeTruthy();
    });
});
