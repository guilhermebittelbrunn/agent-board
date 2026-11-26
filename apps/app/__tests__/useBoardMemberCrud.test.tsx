import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardMemberCrud } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardMemberCrud";
import { queryKeys } from "@/shared/lib/queryKeys";

const {
    inviteMock,
    updateRoleMock,
    removeMock,
    successAlertMock,
    errorAlertMock,
} = vi.hoisted(() => ({
    inviteMock: vi.fn(),
    updateRoleMock: vi.fn(),
    removeMock: vi.fn(),
    successAlertMock: vi.fn(),
    errorAlertMock: vi.fn(),
}));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardMember: {
            invite: (...args: unknown[]) => inviteMock(...args),
            updateRole: (...args: unknown[]) => updateRoleMock(...args),
            remove: (...args: unknown[]) => removeMock(...args),
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

const member = (overrides: Record<string, unknown> = {}) => ({
    id: `${BOARD_ID}__qa-reader`,
    boardId: BOARD_ID,
    login: "qa-reader",
    name: null,
    avatarUrl: null,
    role: "operator" as const,
    status: "active" as const,
    githubRole: "read" as const,
    effectiveRole: "viewer" as const,
    githubRoleCheckedAt: null,
    joinedAt: null,
    createdAt: "2026-11-26T10:00:00.000Z",
    isSelf: false,
    ...overrides,
});

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

const membersInvalidated = () =>
    queryClient.getQueryState(queryKeys.boards.members(BOARD_ID))
        ?.isInvalidated ?? false;

beforeEach(() => {
    for (const mock of [
        inviteMock,
        updateRoleMock,
        removeMock,
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
    queryClient.setQueryData(queryKeys.boards.members(BOARD_ID), []);
});

describe("useBoardMemberCrud", () => {
    it("invites, refreshes the member list and confirms with the login", async () => {
        inviteMock.mockResolvedValue(member({ status: "pending" }));
        const { result } = renderHook(() => useBoardMemberCrud(BOARD_ID), {
            wrapper,
        });

        await act(() =>
            result.current.inviteMemberMutation.mutateAsync({
                login: "qa-reader",
                role: "operator",
            })
        );

        expect(inviteMock).toHaveBeenCalledWith(BOARD_ID, {
            login: "qa-reader",
            role: "operator",
        });
        expect(membersInvalidated()).toBe(true);
        expect(successAlertMock).toHaveBeenCalledWith(
            "Convite criado para qa-reader."
        );
    });

    it("shows the translated error code and leaves the list alone", async () => {
        inviteMock.mockRejectedValue(apiError("BOARD_MEMBER_ALREADY_EXISTS"));
        const { result } = renderHook(() => useBoardMemberCrud(BOARD_ID), {
            wrapper,
        });

        await act(async () => {
            await expect(
                result.current.inviteMemberMutation.mutateAsync({
                    login: "qa-reader",
                    role: "operator",
                })
            ).rejects.toThrow("BOARD_MEMBER_ALREADY_EXISTS");
        });

        expect(errorAlertMock).toHaveBeenCalledWith(
            "Esta pessoa já é membro ou já tem convite neste board."
        );
        expect(membersInvalidated()).toBe(false);
    });

    it("changes the role of a member", async () => {
        updateRoleMock.mockResolvedValue(member({ role: "viewer" }));
        const { result } = renderHook(() => useBoardMemberCrud(BOARD_ID), {
            wrapper,
        });

        await act(() =>
            result.current.changeMemberRoleMutation.mutateAsync({
                member: member(),
                role: "viewer",
            })
        );

        expect(updateRoleMock).toHaveBeenCalledWith(
            BOARD_ID,
            `${BOARD_ID}__qa-reader`,
            { role: "viewer" }
        );
        expect(membersInvalidated()).toBe(true);
    });

    it.each([
        ["active", "qa-reader saiu do board."],
        ["pending", "Convite de qa-reader cancelado."],
    ] as const)(
        "removes a %s member with its own message",
        async (status, message) => {
            removeMock.mockResolvedValue(undefined);
            const { result } = renderHook(() => useBoardMemberCrud(BOARD_ID), {
                wrapper,
            });

            await act(() =>
                result.current.removeMemberMutation.mutateAsync(
                    member({ status })
                )
            );

            expect(removeMock).toHaveBeenCalledWith(
                BOARD_ID,
                `${BOARD_ID}__qa-reader`
            );
            expect(successAlertMock).toHaveBeenCalledWith(message);
            expect(membersInvalidated()).toBe(true);
        }
    );
});
