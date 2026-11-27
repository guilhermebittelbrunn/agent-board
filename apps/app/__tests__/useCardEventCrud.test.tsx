import type { CardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardEventCrud } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useCardEventCrud";
import { queryKeys } from "@/shared/lib/queryKeys";
import { updateAt } from "./cardEventFixtures";

const { answerMock, commentMock, successAlertMock, errorAlertMock } =
    vi.hoisted(() => ({
        answerMock: vi.fn(),
        commentMock: vi.fn(),
        successAlertMock: vi.fn(),
        errorAlertMock: vi.fn(),
    }));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardCard: {
            answer: (...args: unknown[]) => answerMock(...args),
            comment: (...args: unknown[]) => commentMock(...args),
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
const SLUG = "search-cards";
const PENDING = { eventId: "q1", stageKey: "analyze", count: 1 };

const card = (overrides: Partial<CardDTO> = {}): CardDTO => ({
    id: `${BOARD_ID}__${SLUG}`,
    boardId: BOARD_ID,
    slug: SLUG,
    title: "Busca",
    spec: {
        path: "specs/features/search-cards.md",
        sha: "x",
        status: "approved",
        ref: null,
    },
    ready: true,
    orphan: false,
    lane: "stage",
    origin: "repository",
    request: null,
    specApproval: null,
    stageKey: "analyze",
    state: "idle",
    pendingAsk: PENDING,
    activeRunId: null,
    lastRun: null,
    reworkLoops: 0,
    order: 0,
    branch: "feat/search-cards",
    movedAt: null,
    syncedAt: "2026-11-26T10:00:00.000Z",
    createdAt: "2026-11-26T10:00:00.000Z",
    updatedAt: "2026-11-26T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
});

const apiError = (code: string) =>
    Object.assign(new Error(code), {
        isAxiosError: true,
        response: {
            status: HTTP_STATUS.CONFLICT,
            data: { error: { code } },
        },
    });

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

const cardKey = queryKeys.boards.card(BOARD_ID, SLUG);
const eventsKey = queryKeys.boards.cardEvents(BOARD_ID, SLUG);
const cardsKey = queryKeys.boards.cards(BOARD_ID);
const isInvalidated = (key: readonly unknown[]) =>
    queryClient.getQueryState(key)?.isInvalidated ?? false;
const ANSWER = {
    questionEventId: "q1",
    answers: [{ kind: "option" as const, option: 0 }],
};

beforeEach(() => {
    for (const mock of [
        answerMock,
        commentMock,
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
    queryClient.setQueryData(cardKey, card());
    queryClient.setQueryData(eventsKey, [updateAt("u1", 1, "analyze")]);
    queryClient.setQueryData(cardsKey, [card()]);
});

describe("useCardEventCrud", () => {
    it("stores the answered card and re-reads the timeline and the board", async () => {
        const answered = card({ pendingAsk: null });
        answerMock.mockResolvedValue({
            event: updateAt("a1", 2, "analyze"),
            card: answered,
        });
        const { result } = renderHook(() => useCardEventCrud(BOARD_ID, SLUG), {
            wrapper,
        });

        await act(async () => {
            await result.current.answerMutation.mutateAsync(ANSWER);
        });

        expect(answerMock).toHaveBeenCalledWith(BOARD_ID, SLUG, ANSWER);
        expect(
            queryClient.getQueryData<CardDTO>(cardKey)?.pendingAsk
        ).toBeNull();
        expect(isInvalidated(eventsKey)).toBe(true);
        expect(isInvalidated(cardsKey)).toBe(true);
        expect(successAlertMock).toHaveBeenCalledTimes(1);
    });

    it("re-reads the card and the timeline when the questions are no longer pending", async () => {
        answerMock.mockRejectedValue(apiError("CARD_QUESTIONS_NOT_PENDING"));
        const { result } = renderHook(() => useCardEventCrud(BOARD_ID, SLUG), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.answerMutation.mutateAsync(ANSWER)
            ).rejects.toThrow("CARD_QUESTIONS_NOT_PENDING");
        });

        expect(errorAlertMock).toHaveBeenCalledWith(
            expect.stringContaining("já foram respondidas")
        );
        expect(isInvalidated(cardKey)).toBe(true);
        expect(isInvalidated(eventsKey)).toBe(true);
    });

    it("re-reads the timeline after a comment", async () => {
        commentMock.mockResolvedValue(updateAt("c1", 2, "analyze"));
        const { result } = renderHook(() => useCardEventCrud(BOARD_ID, SLUG), {
            wrapper,
        });

        await act(async () => {
            await result.current.commentMutation.mutateAsync({
                markdown: "oi",
            });
        });

        expect(commentMock).toHaveBeenCalledWith(BOARD_ID, SLUG, {
            markdown: "oi",
        });
        expect(isInvalidated(eventsKey)).toBe(true);
        expect(isInvalidated(cardKey)).toBe(false);
    });
});
