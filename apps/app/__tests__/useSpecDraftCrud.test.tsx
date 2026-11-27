import type { CardDTO, CreateSpecDraftResultDTO } from "@repo/sdk/src/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSpecDraftCrud } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useSpecDraftCrud";
import { queryKeys } from "@/shared/lib/queryKeys";
import { runCard } from "./runCardFixtures";

const {
    createMock,
    uploadMock,
    approveSpecMock,
    discardDraftMock,
    successAlertMock,
    errorAlertMock,
} = vi.hoisted(() => ({
    createMock: vi.fn(),
    uploadMock: vi.fn(),
    approveSpecMock: vi.fn(),
    discardDraftMock: vi.fn(),
    successAlertMock: vi.fn(),
    errorAlertMock: vi.fn(),
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardDraft: {
            create: (...args: unknown[]) => createMock(...args),
            uploadAttachment: (...args: unknown[]) => uploadMock(...args),
        },
        boardCard: {
            approveSpec: (...args: unknown[]) => approveSpecMock(...args),
            discardDraft: (...args: unknown[]) => discardDraftMock(...args),
        },
    },
}));
vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        successAlert: successAlertMock,
        errorAlert: errorAlertMock,
    }),
}));

const BOARD_ID = "b";
const apiError = (code: string) =>
    Object.assign(new Error(code), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code } } },
    });

const draft = (overrides: Partial<CardDTO> = {}): CardDTO =>
    runCard("slack-alerts", {
        lane: "drafts",
        stageKey: "spec",
        origin: "board",
        ready: false,
        ...overrides,
    });

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
const cardsKey = queryKeys.boards.cards(BOARD_ID);
const cardsInvalidated = () =>
    queryClient.getQueryState(cardsKey)?.isInvalidated ?? false;

beforeEach(() => {
    for (const mock of [
        createMock,
        uploadMock,
        approveSpecMock,
        discardDraftMock,
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
    queryClient.setQueryData(cardsKey, []);
});

describe("useSpecDraftCrud", () => {
    it("creates a draft, keeps the card and reads the board again", async () => {
        const result: CreateSpecDraftResultDTO = {
            card: draft(),
            run: null,
        };
        createMock.mockResolvedValue(result);
        const { result: hook } = renderHook(() => useSpecDraftCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await hook.current.createDraftMutation.mutateAsync({
                text: "Quero alertas",
                attachments: [],
            });
        });

        expect(createMock).toHaveBeenCalledWith(BOARD_ID, {
            text: "Quero alertas",
            attachments: [],
        });
        expect(
            queryClient.getQueryData(
                queryKeys.boards.card(BOARD_ID, "slack-alerts")
            )
        ).toEqual(result.card);
        expect(cardsInvalidated()).toBe(true);
        expect(successAlertMock).toHaveBeenCalledWith(
            "Rascunho criado, mas a escrita não começou. Abra o card e rode de novo."
        );
    });

    it("shows the translated error when approval is refused", async () => {
        approveSpecMock.mockRejectedValue(apiError("CARD_SPEC_NOT_READY"));
        const { result: hook } = renderHook(() => useSpecDraftCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                hook.current.approveSpecMutation.mutateAsync(draft())
            ).rejects.toThrow("CARD_SPEC_NOT_READY");
        });

        expect(errorAlertMock).toHaveBeenCalledWith(
            "A spec ainda não está pronta: espere a rodada terminar e responda às perguntas abertas."
        );
        expect(successAlertMock).not.toHaveBeenCalled();
    });

    it("drops the discarded card from the cache", async () => {
        discardDraftMock.mockResolvedValue(undefined);
        const key = queryKeys.boards.card(BOARD_ID, "slack-alerts");
        queryClient.setQueryData(key, draft());
        const { result: hook } = renderHook(() => useSpecDraftCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await hook.current.discardDraftMutation.mutateAsync(draft());
        });

        expect(queryClient.getQueryData(key)).toBeUndefined();
        expect(cardsInvalidated()).toBe(true);
    });
});
