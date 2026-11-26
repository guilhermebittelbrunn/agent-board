import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardCrud } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCrud";
import { queryKeys } from "@/shared/lib/queryKeys";

const { createMock, reloadMock, errorAlertMock } = vi.hoisted(() => ({
    createMock: vi.fn(),
    reloadMock: vi.fn(),
    errorAlertMock: vi.fn(),
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        board: {
            create: (...args: unknown[]) => createMock(...args),
            reload: (...args: unknown[]) => reloadMock(...args),
        },
    },
}));
vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({ successAlert: vi.fn(), errorAlert: errorAlertMock }),
}));
vi.mock("@repo/internationalization/client", () => ({
    getDictionary: () => ({ locale: "pt-br", dictionary: {} }),
}));
vi.mock("@repo/shared/utils/helpers/formattedError", () => ({
    default: class FormattedError {
        error: unknown;
        constructor(error: unknown) {
            this.error = error;
        }
    },
}));
vi.mock("@repo/shared/utils/helpers/handleClientError", () => ({
    handleClientError: () => "translated error",
}));

const BOARD_ID = "agent-board-demo--sample-app";
const REPOSITORY = "agent-board-demo/sample-app";
const board = (sha: string) => ({
    id: BOARD_ID,
    configSource: { sha },
});

const apiError = (code: string) =>
    Object.assign(new Error(code), {
        response: { data: { error: { code } } },
    });

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

function seed(key: readonly unknown[], value: unknown) {
    queryClient.setQueryData(key, value);
}

const isInvalidated = (key: readonly unknown[]) =>
    queryClient.getQueryState(key)?.isInvalidated ?? false;

beforeEach(() => {
    createMock.mockReset();
    reloadMock.mockReset();
    errorAlertMock.mockReset();
    queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    seed(queryKeys.boards.list(), []);
    seed(queryKeys.boards.repositories(), []);
    seed(queryKeys.boards.preview(REPOSITORY), { status: "valid" });
});

describe("useBoardCrud.create", () => {
    it("invalidates the list and the repositories and hands the board over", async () => {
        createMock.mockResolvedValue(board("abc"));
        const onCreated = vi.fn();
        const { result } = renderHook(() => useBoardCrud({ onCreated }), {
            wrapper,
        });

        result.current.createBoardMutation.mutate(REPOSITORY);

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(createMock).toHaveBeenCalledWith({ repository: REPOSITORY });
        expect(isInvalidated(queryKeys.boards.list())).toBe(true);
        expect(isInvalidated(queryKeys.boards.repositories())).toBe(true);
        expect(
            queryClient.getQueryData(queryKeys.boards.detail(BOARD_ID))
        ).toEqual(board("abc"));
    });

    it("shows the error and reads the file again when it changed under the preview", async () => {
        createMock.mockRejectedValue(apiError("BOARD_CONFIG_INVALID"));
        const { result } = renderHook(() => useBoardCrud(), { wrapper });

        result.current.createBoardMutation.mutate(REPOSITORY);

        await waitFor(() =>
            expect(errorAlertMock).toHaveBeenCalledWith("translated error")
        );
        await waitFor(() =>
            expect(isInvalidated(queryKeys.boards.preview(REPOSITORY))).toBe(
                true
            )
        );
    });

    it("leaves the preview alone for an unrelated error", async () => {
        createMock.mockRejectedValue(
            apiError("AUTH_REQUEST_IMPERSONATION_READ_ONLY")
        );
        const { result } = renderHook(() => useBoardCrud(), { wrapper });

        result.current.createBoardMutation.mutate(REPOSITORY);

        await waitFor(() => expect(errorAlertMock).toHaveBeenCalled());
        expect(isInvalidated(queryKeys.boards.preview(REPOSITORY))).toBe(false);
    });
});

describe("useBoardCrud.reload", () => {
    it("writes the updated board into the detail cache", async () => {
        seed(queryKeys.boards.detail(BOARD_ID), board("old"));
        reloadMock.mockResolvedValue({
            outcome: "updated",
            board: board("new"),
            changes: null,
            issues: [],
        });
        const { result } = renderHook(() => useBoardCrud(), { wrapper });

        result.current.reloadBoardMutation.mutate(BOARD_ID);

        await waitFor(() =>
            expect(result.current.reloadBoardMutation.isSuccess).toBe(true)
        );
        expect(
            queryClient.getQueryData(queryKeys.boards.detail(BOARD_ID))
        ).toEqual(board("new"));
        expect(isInvalidated(queryKeys.boards.list())).toBe(true);
    });

    it("keeps the cache when nothing was applied", async () => {
        seed(queryKeys.boards.detail(BOARD_ID), board("old"));
        reloadMock.mockResolvedValue({
            outcome: "invalid",
            board: board("old"),
            changes: null,
            issues: [{ path: "stages", rule: "required", params: {} }],
        });
        const { result } = renderHook(() => useBoardCrud(), { wrapper });

        result.current.reloadBoardMutation.mutate(BOARD_ID);

        await waitFor(() =>
            expect(result.current.reloadBoardMutation.isSuccess).toBe(true)
        );
        expect(isInvalidated(queryKeys.boards.list())).toBe(false);
        expect(isInvalidated(queryKeys.boards.detail(BOARD_ID))).toBe(false);
    });

    it("shows the error of a refused reload", async () => {
        reloadMock.mockRejectedValue(apiError("BOARD_IMPORT_FORBIDDEN"));
        const { result } = renderHook(() => useBoardCrud(), { wrapper });

        result.current.reloadBoardMutation.mutate(BOARD_ID);

        await waitFor(() =>
            expect(errorAlertMock).toHaveBeenCalledWith("translated error")
        );
    });
});
