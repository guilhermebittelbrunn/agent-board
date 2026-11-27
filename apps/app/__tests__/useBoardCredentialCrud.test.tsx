import type {
    BoardCredentialsDTO,
    ScheduledTaskCredentialDTO,
} from "@repo/sdk/src/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardCredentialCrud } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCredentialCrud";
import {
    fetchBoardCredentials,
    useListBoardCredentials,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardCredentials";
import { queryKeys } from "@/shared/lib/queryKeys";

const {
    listMock,
    saveMock,
    removeMock,
    successAlertMock,
    errorAlertMock,
    authorized,
} = vi.hoisted(() => ({
    listMock: vi.fn(),
    saveMock: vi.fn(),
    removeMock: vi.fn(),
    successAlertMock: vi.fn(),
    errorAlertMock: vi.fn(),
    authorized: { value: true },
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardCredential: {
            list: (...args: unknown[]) => listMock(...args),
            saveScheduledTask: (...args: unknown[]) => saveMock(...args),
            removeScheduledTask: (...args: unknown[]) => removeMock(...args),
        },
    },
}));
vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        successAlert: successAlertMock,
        errorAlert: errorAlertMock,
    }),
}));
vi.mock("@/shared/providers/ApiAuthProvider", () => ({
    useSdkAuthorized: () => authorized.value,
}));

const UNPROCESSABLE = 422;
const NOT_FOUND = 404;
const BOARD_ID = "agent-board-demo--sample-app";
const KEY = queryKeys.boards.credentials(BOARD_ID);
const BODY = {
    fireUrl:
        "https://api.anthropic.com/v1/claude_code/routines/trig_fakeAbcd/fire",
    token: "fake-token-for-tests-only-9z8y",
};

const task = (
    overrides: Partial<ScheduledTaskCredentialDTO> = {}
): ScheduledTaskCredentialDTO => ({
    stageKey: "analyze",
    triggerIdLast4: "Abcd",
    tokenLast4: "1111",
    lastCheckedAt: null,
    lastCheckStatus: null,
    updatedAt: "2026-11-27T10:00:00.000Z",
    ...overrides,
});

const apiError = (status: number, code: string) =>
    Object.assign(new Error(code), {
        isAxiosError: true,
        response: { status, data: { error: { code } } },
    });

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

const cached = () => queryClient.getQueryData<BoardCredentialsDTO>(KEY);

beforeEach(() => {
    for (const mock of [
        listMock,
        saveMock,
        removeMock,
        successAlertMock,
        errorAlertMock,
    ]) {
        mock.mockReset();
    }
    authorized.value = true;
    queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    queryClient.setQueryData<BoardCredentialsDTO>(KEY, {
        cloudCredentialsEnabled: true,
        scheduledTasks: [
            task(),
            task({ stageKey: "review", triggerIdLast4: "Wxyz" }),
        ],
    });
});

describe("useBoardCredentialCrud", () => {
    it("replaces the saved stage in the cache without refetching the list", async () => {
        saveMock.mockResolvedValue(task({ tokenLast4: "2222" }));
        const { result } = renderHook(() => useBoardCredentialCrud(BOARD_ID), {
            wrapper,
        });

        await act(() =>
            result.current.saveMutation.mutateAsync({
                target: { stageKey: "analyze", column: "Análise" },
                body: BODY,
            })
        );

        expect(saveMock).toHaveBeenCalledWith(BOARD_ID, "analyze", BODY);
        const tasks = cached()?.scheduledTasks ?? [];
        expect(tasks.filter((item) => item.stageKey === "analyze")).toEqual([
            task({ tokenLast4: "2222" }),
        ]);
        expect(tasks.map((item) => item.stageKey).sort()).toEqual([
            "analyze",
            "review",
        ]);
        expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(false);
        expect(listMock).not.toHaveBeenCalled();
        expect(successAlertMock).toHaveBeenCalledWith(
            "Tarefa agendada de Análise salva."
        );
    });

    it("leaves the cache alone and shows the translated code when saving fails", async () => {
        saveMock.mockRejectedValue(
            apiError(UNPROCESSABLE, "CREDENTIAL_FIRE_URL_INVALID")
        );
        const before = cached();
        const { result } = renderHook(() => useBoardCredentialCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.saveMutation.mutateAsync({
                    target: { stageKey: "analyze", column: "Análise" },
                    body: BODY,
                })
            ).rejects.toThrow("CREDENTIAL_FIRE_URL_INVALID");
        });

        expect(cached()).toEqual(before);
        expect(errorAlertMock).toHaveBeenCalledTimes(1);
        expect(errorAlertMock.mock.calls[0]?.[0]).not.toContain(
            "CREDENTIAL_FIRE_URL_INVALID"
        );
        expect(successAlertMock).not.toHaveBeenCalled();
    });

    it("drops only the removed stage from the cache", async () => {
        removeMock.mockResolvedValue(undefined);
        const { result } = renderHook(() => useBoardCredentialCrud(BOARD_ID), {
            wrapper,
        });

        await act(() =>
            result.current.removeMutation.mutateAsync({
                stageKey: "review",
                column: "Revisando",
            })
        );

        expect(removeMock).toHaveBeenCalledWith(BOARD_ID, "review");
        expect(cached()?.scheduledTasks).toEqual([task()]);
        expect(successAlertMock).toHaveBeenCalledWith(
            "Tarefa agendada de Revisando removida."
        );
    });

    it("keeps the row when the API answers CREDENTIAL_NOT_FOUND", async () => {
        removeMock.mockRejectedValue(
            apiError(NOT_FOUND, "CREDENTIAL_NOT_FOUND")
        );
        const { result } = renderHook(() => useBoardCredentialCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.removeMutation.mutateAsync({
                    stageKey: "review",
                    column: "Revisando",
                })
            ).rejects.toThrow("CREDENTIAL_NOT_FOUND");
        });

        expect(cached()?.scheduledTasks).toHaveLength(2);
        expect(errorAlertMock).toHaveBeenCalledTimes(1);
    });

    it("does not create a cache entry when the list was never loaded", async () => {
        queryClient.removeQueries({ queryKey: KEY });
        saveMock.mockResolvedValue(task());
        const { result } = renderHook(() => useBoardCredentialCrud(BOARD_ID), {
            wrapper,
        });

        await act(() =>
            result.current.saveMutation.mutateAsync({
                target: { stageKey: "analyze", column: "Análise" },
                body: BODY,
            })
        );

        expect(cached()).toBeUndefined();
    });
});

describe("useListBoardCredentials", () => {
    it("fetches the list of the board", async () => {
        queryClient.removeQueries({ queryKey: KEY });
        listMock.mockResolvedValue({
            cloudCredentialsEnabled: false,
            scheduledTasks: [],
        });
        const { result } = renderHook(() => useListBoardCredentials(BOARD_ID), {
            wrapper,
        });

        await waitFor(() =>
            expect(result.current.data).toEqual({
                cloudCredentialsEnabled: false,
                scheduledTasks: [],
            })
        );
        expect(listMock).toHaveBeenCalledWith(BOARD_ID);
    });

    it("waits for the SDK token before asking the API", () => {
        queryClient.removeQueries({ queryKey: KEY });
        authorized.value = false;
        renderHook(() => useListBoardCredentials(BOARD_ID), { wrapper });

        expect(listMock).not.toHaveBeenCalled();
    });

    it("does not call the API without a board id", async () => {
        expect(await fetchBoardCredentials(undefined)).toBeUndefined();
        renderHook(() => useListBoardCredentials(undefined), { wrapper });

        expect(listMock).not.toHaveBeenCalled();
    });
});
