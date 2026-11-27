import type { CardDTO } from "@repo/sdk/src/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardCardCrud } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCardCrud";
import { queryKeys } from "@/shared/lib/queryKeys";

const {
    syncMock,
    reorderMock,
    moveMock,
    triggerMock,
    stopMock,
    openPullRequestMock,
    successAlertMock,
    errorAlertMock,
} = vi.hoisted(() => ({
    openPullRequestMock: vi.fn(),
    syncMock: vi.fn(),
    reorderMock: vi.fn(),
    moveMock: vi.fn(),
    triggerMock: vi.fn(),
    stopMock: vi.fn(),
    successAlertMock: vi.fn(),
    errorAlertMock: vi.fn(),
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardCard: {
            sync: (...args: unknown[]) => syncMock(...args),
            reorder: (...args: unknown[]) => reorderMock(...args),
            move: (...args: unknown[]) => moveMock(...args),
            trigger: (...args: unknown[]) => triggerMock(...args),
            stop: (...args: unknown[]) => stopMock(...args),
            openPullRequest: (...args: unknown[]) =>
                openPullRequestMock(...args),
        },
    },
}));
vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        successAlert: successAlertMock,
        errorAlert: errorAlertMock,
    }),
}));

const BOARD_ID = "agent-board-demo--sample-app";

const PR_NUMBER = 12;

const card = (slug: string, overrides: Partial<CardDTO> = {}): CardDTO => ({
    id: `${BOARD_ID}__${slug}`,
    boardId: BOARD_ID,
    slug,
    title: slug,
    spec: {
        path: `specs/features/${slug}.md`,
        sha: "x",
        status: "approved",
        ref: null,
    },
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
    cycleId: null,
    reworkLoops: 0,
    order: 0,
    branch: `feat/${slug}`,
    movedAt: null,
    syncedAt: "2026-11-26T10:00:00.000Z",
    createdAt: "2026-11-26T10:00:00.000Z",
    updatedAt: "2026-11-26T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
});

const INITIAL = [
    card("a", { order: 0 }),
    card("b", { order: 1 }),
    card("c", { order: 2 }),
];

const apiError = (code: string) =>
    Object.assign(new Error(code), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code } } },
    });

/** Settles a promise the test controls, to look at the cache while the request is in flight. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

const cardsKey = queryKeys.boards.cards(BOARD_ID);
const cached = () => queryClient.getQueryData<CardDTO[]>(cardsKey) ?? [];
const orderOf = (slug: string) =>
    cached().find((item) => item.slug === slug)?.order;
const cardsInvalidated = () =>
    queryClient.getQueryState(cardsKey)?.isInvalidated ?? false;

beforeEach(() => {
    for (const mock of [
        syncMock,
        reorderMock,
        moveMock,
        triggerMock,
        stopMock,
        openPullRequestMock,
        successAlertMock,
        errorAlertMock,
    ]) {
        mock.mockReset();
    }
    queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    queryClient.setQueryData(cardsKey, INITIAL);
});

describe("useBoardCardCrud", () => {
    it("reorders at once, before the API answers", async () => {
        const request = deferred<CardDTO[]>();
        reorderMock.mockReturnValue(request.promise);
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        let pending: Promise<unknown> = Promise.resolve();
        await act(async () => {
            pending = result.current.reorderMutation.mutateAsync([
                "c",
                "a",
                "b",
            ]);
            await Promise.resolve();
        });

        expect(reorderMock).toHaveBeenCalledWith(BOARD_ID, {
            slugs: ["c", "a", "b"],
        });
        expect(orderOf("c")).toBe(0);
        expect(orderOf("b")).toBe(2);

        await act(async () => {
            request.resolve([card("c", { order: 0 })]);
            await pending;
        });
        expect(cached().map((item) => item.slug)).toEqual(["c"]);
    });

    it("puts the old order back and reads the board again when the API refuses", async () => {
        reorderMock.mockRejectedValue(apiError("CARD_ORDER_STALE"));
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.reorderMutation.mutateAsync(["c", "a", "b"])
            ).rejects.toThrow("CARD_ORDER_STALE");
        });

        expect(cached()).toEqual(INITIAL);
        expect(cardsInvalidated()).toBe(true);
        expect(errorAlertMock).toHaveBeenCalledWith(
            "O quadro mudou enquanto você reordenava. Ele foi atualizado; tente de novo."
        );
    });

    it("moves a stage card back to Tasks idle at once and keeps the server's answer", async () => {
        queryClient.setQueryData(cardsKey, [
            card("a", { lane: "stage", stageKey: "develop", state: "failed" }),
            ...INITIAL.slice(1),
        ]);
        const moved = card("a", {
            order: 3,
            movedAt: "2026-11-26T11:00:00.000Z",
        });
        const request = deferred<CardDTO>();
        moveMock.mockReturnValue(request.promise);
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.moveMutation.mutateAsync({
                card: cached()[0] as CardDTO,
                target: { lane: "tasks" },
            });
        });
        await vi.waitFor(() =>
            expect(cached().find((item) => item.slug === "a")).toMatchObject({
                lane: "tasks",
                stageKey: null,
                state: "idle",
                order: 3,
            })
        );
        await act(async () => {
            request.resolve(moved);
            await pending;
        });

        expect(moveMock).toHaveBeenCalledWith(BOARD_ID, "a", { lane: "tasks" });
        expect(cached().find((item) => item.slug === "a")).toEqual(moved);
        expect(
            queryClient.getQueryData(queryKeys.boards.card(BOARD_ID, "a"))
        ).toEqual(moved);
        expect(cardsInvalidated()).toBe(false);
    });

    it("queues a triggered card in its stage at once and keeps the server's answer", async () => {
        const started = card("a", {
            lane: "stage",
            stageKey: "analyze",
            state: "running",
            activeRunId: "r1",
        });
        const request = deferred<{ card: CardDTO; run: { id: string } }>();
        triggerMock.mockReturnValue(request.promise);
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.triggerMutation.mutateAsync({
                card: INITIAL[0] as CardDTO,
                stageKey: "analyze",
            });
        });
        await vi.waitFor(() =>
            expect(cached().find((item) => item.slug === "a")).toMatchObject({
                lane: "stage",
                stageKey: "analyze",
                state: "queued",
            })
        );
        await act(async () => {
            request.resolve({ card: started, run: { id: "r1" } });
            await pending;
        });

        expect(triggerMock).toHaveBeenCalledWith(BOARD_ID, "a", {
            stageKey: "analyze",
        });
        expect(moveMock).not.toHaveBeenCalled();
        expect(cached().find((item) => item.slug === "a")).toEqual(started);
        expect(
            queryClient.getQueryData(queryKeys.boards.card(BOARD_ID, "a"))
        ).toEqual(started);
    });

    it("rolls a refused trigger back and reads the board again", async () => {
        triggerMock.mockRejectedValue(apiError("CARD_RUN_ACTIVE"));
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.triggerMutation.mutateAsync({
                    card: INITIAL[0] as CardDTO,
                    stageKey: "analyze",
                })
            ).rejects.toThrow("CARD_RUN_ACTIVE");
        });

        expect(cached()).toEqual(INITIAL);
        expect(cardsInvalidated()).toBe(true);
        expect(errorAlertMock).toHaveBeenCalledTimes(1);
    });

    it("stores the stopped card the server answers", async () => {
        const stopped = card("a", {
            lane: "stage",
            stageKey: "analyze",
            state: "idle",
        });
        stopMock.mockResolvedValue(stopped);
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        await act(() =>
            result.current.stopMutation.mutateAsync(INITIAL[0] as CardDTO)
        );

        expect(stopMock).toHaveBeenCalledWith(BOARD_ID, "a");
        expect(cached().find((item) => item.slug === "a")).toEqual(stopped);
    });

    it("rolls a refused move back", async () => {
        moveMock.mockRejectedValue(apiError("CARD_NOT_READY"));
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.moveMutation.mutateAsync({
                    card: INITIAL[1] as CardDTO,
                    target: { lane: "done" },
                })
            ).rejects.toThrow("CARD_NOT_READY");
        });

        expect(cached()).toEqual(INITIAL);
        expect(errorAlertMock).toHaveBeenCalledWith(
            "Este card ainda não está pronto para sair de Tarefas."
        );
    });

    it("stores the synced cards, refreshes the board and reports the summary", async () => {
        const backlogSync = {
            indexPath: "specs/BACKLOG.md",
            indexSha: "abc",
            ref: "main",
            syncedAt: "2026-11-26T12:00:00.000Z",
            specCount: 5,
        };
        queryClient.setQueryData(queryKeys.boards.detail(BOARD_ID), {
            id: BOARD_ID,
            backlogSync: null,
        });
        syncMock.mockResolvedValue({
            created: 2,
            updated: 1,
            orphaned: 0,
            unchanged: 0,
            skipped: [],
            cards: [card("z")],
            backlogSync,
        });
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        await act(() => result.current.syncMutation.mutateAsync());

        expect(cached().map((item) => item.slug)).toEqual(["z"]);
        expect(
            queryClient.getQueryData(queryKeys.boards.detail(BOARD_ID))
        ).toMatchObject({ backlogSync });
        expect(
            queryClient.getQueryState(queryKeys.boards.detail(BOARD_ID))
                ?.isInvalidated
        ).toBe(true);
        expect(successAlertMock).toHaveBeenCalledWith(
            "Backlog sincronizado: 2 criados, 1 atualizados, 0 órfãos."
        );
    });

    it("stores the card with its pull request and reads the card, list and events again", async () => {
        const target = card("a", { lane: "stage", stageKey: "pr" });
        const opened = {
            ...target,
            pullRequestError: null,
            cycleId: null,
            pullRequest: { number: PR_NUMBER } as CardDTO["pullRequest"],
        };
        openPullRequestMock.mockResolvedValue(opened);
        const eventsKey = queryKeys.boards.cardEvents(BOARD_ID, "a");
        queryClient.setQueryData(eventsKey, []);
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        await act(() =>
            result.current.openPullRequestMutation.mutateAsync(target)
        );

        expect(openPullRequestMock).toHaveBeenCalledWith(BOARD_ID, "a");
        expect(
            queryClient.getQueryData<CardDTO>(
                queryKeys.boards.card(BOARD_ID, "a")
            )?.pullRequest?.number
        ).toBe(PR_NUMBER);
        expect(cardsInvalidated()).toBe(true);
        expect(queryClient.getQueryState(eventsKey)?.isInvalidated).toBe(true);
    });

    it("shows the translated error when the pull request cannot be opened", async () => {
        openPullRequestMock.mockRejectedValue(
            apiError("GITHUB_APP_PERMISSION_MISSING")
        );
        const { result } = renderHook(() => useBoardCardCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await result.current.openPullRequestMutation
                .mutateAsync(card("a"))
                .catch(() => null);
        });

        expect(errorAlertMock).toHaveBeenCalledWith(
            expect.stringContaining("Pull requests: Read and write")
        );
    });
});
