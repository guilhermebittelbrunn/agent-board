import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardCycleCrud } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCycleCrud";
import { queryKeys } from "@/shared/lib/queryKeys";

const { createMock, stopMock, pushMock, successAlertMock, errorAlertMock } =
    vi.hoisted(() => ({
        createMock: vi.fn(),
        stopMock: vi.fn(),
        pushMock: vi.fn(),
        successAlertMock: vi.fn(),
        errorAlertMock: vi.fn(),
    }));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardCycle: {
            create: (...args: unknown[]) => createMock(...args),
            stop: (...args: unknown[]) => stopMock(...args),
        },
    },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: pushMock }),
}));

vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        successAlert: successAlertMock,
        errorAlert: errorAlertMock,
    }),
}));

const BOARD_ID = "b1";

const apiError = (code: string) =>
    Object.assign(new Error(code), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code } } },
    });

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

const body = {
    slugs: ["alpha"],
    options: {
        until: "pull_request" as const,
        concurrency: 1 as const,
        onFailure: "skip" as const,
    },
};

beforeEach(() => {
    queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    for (const mock of [
        createMock,
        stopMock,
        pushMock,
        successAlertMock,
        errorAlertMock,
    ]) {
        mock.mockReset();
    }
});

describe("useBoardCycleCrud", () => {
    it("refreshes cycles and cards and opens the new cycle", async () => {
        createMock.mockResolvedValue({ id: "c1", status: "running" });
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");
        const { result } = renderHook(() => useBoardCycleCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await result.current.createCycleMutation.mutateAsync(body);
        });

        expect(createMock).toHaveBeenCalledWith(BOARD_ID, body);
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.boards.cycles(BOARD_ID),
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.boards.cards(BOARD_ID),
        });
        expect(successAlertMock).toHaveBeenCalledWith("Ciclo iniciado.");
        expect(pushMock).toHaveBeenCalledWith(
            expect.stringContaining("/boards/b1/cycles/c1")
        );
    });

    it("says a queued cycle went to the queue", async () => {
        createMock.mockResolvedValue({ id: "c2", status: "queued" });
        const { result } = renderHook(() => useBoardCycleCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await result.current.createCycleMutation.mutateAsync(body);
        });

        expect(successAlertMock).toHaveBeenCalledWith("Ciclo na fila.");
    });

    it("shows the API error copy and stays on the page", async () => {
        createMock.mockRejectedValue(apiError("CYCLE_SPEC_BUSY"));
        const { result } = renderHook(() => useBoardCycleCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.createCycleMutation.mutateAsync(body)
            ).rejects.toThrow("CYCLE_SPEC_BUSY");
        });

        expect(errorAlertMock).toHaveBeenCalledWith(
            "Alguma spec escolhida já está em outro ciclo."
        );
        expect(pushMock).not.toHaveBeenCalled();
    });

    it("stops the cycle and refreshes what it shows", async () => {
        stopMock.mockResolvedValue({ id: "c1", status: "stopped" });
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");
        const { result } = renderHook(() => useBoardCycleCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await result.current.stopCycleMutation.mutateAsync("c1");
        });

        expect(stopMock).toHaveBeenCalledWith(BOARD_ID, "c1");
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.boards.cycles(BOARD_ID),
        });
        expect(successAlertMock).toHaveBeenCalledWith("Ciclo parado.");
    });
});
