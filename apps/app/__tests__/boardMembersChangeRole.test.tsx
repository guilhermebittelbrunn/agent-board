import type { BoardMemberDTO } from "@repo/sdk/src/types";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BOARD_ID = "agent-board-demo--sample-app";

const { hookState, changeRoleMock } = vi.hoisted(() => ({
    hookState: { isFetching: false, revision: 0 },
    changeRoleMock: vi.fn(),
}));

const member = (overrides: Partial<BoardMemberDTO>): BoardMemberDTO => ({
    id: `${BOARD_ID}__qa-writer`,
    boardId: BOARD_ID,
    login: "qa-writer",
    name: null,
    avatarUrl: null,
    role: "operator",
    status: "active",
    githubRole: "write",
    effectiveRole: "operator",
    githubRoleCheckedAt: null,
    joinedAt: null,
    createdAt: "2026-11-26T10:00:00.000Z",
    isSelf: false,
    ...overrides,
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
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
                    role: "owner",
                    githubRole: "admin",
                    effectiveRole: "owner",
                    checkedAt: null,
                },
            },
            isLoading: false,
            error: null,
        }),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardMembers",
    () => ({
        useListBoardMembers: () => ({
            data: [
                member({
                    id: `${BOARD_ID}__qa-owner`,
                    login: "qa-owner",
                    role: "owner",
                    isSelf: true,
                }),
                member({}),
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            isFetching: hookState.isFetching,
        }),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardMemberCrud",
    () => ({
        useBoardMemberCrud: () => ({
            inviteMemberMutation: { isPending: false, mutateAsync: vi.fn() },
            changeMemberRoleMutation: {
                isPending: hookState.isFetching,
                mutateAsync: changeRoleMock,
            },
            removeMemberMutation: { mutate: vi.fn() },
        }),
    })
);

vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardMembersTable",
    () => ({
        BoardMembersTable: ({
            members,
            canChange,
            onChangeRole,
        }: {
            members: BoardMemberDTO[];
            canChange: (member: BoardMemberDTO) => boolean;
            onChangeRole: (member: BoardMemberDTO) => void;
        }) => (
            <div>
                {members.filter(canChange).map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onChangeRole(item)}
                        type="button"
                    >
                        {`abrir ${item.login}`}
                    </button>
                ))}
            </div>
        ),
    })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/InviteMemberForm",
    () => ({ InviteMemberForm: () => null })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardRolesGuide",
    () => ({ BoardRolesGuide: () => null })
);
vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardSectionNav",
    () => ({ BoardSectionNav: () => null })
);

/**
 * The Radix select does not open in jsdom, so a stand-in shows the bound value and lets the
 * test emit a choice, the same contract the real primitive offers the form field.
 */
vi.mock("@repo/design-system/components/ui/select", () => ({
    Select: ({
        value,
        onValueChange,
    }: {
        value?: string;
        onValueChange?: (next: string) => void;
    }) => (
        <div>
            <output data-testid="role-value">{value ?? "(vazio)"}</output>
            <button onClick={() => onValueChange?.("viewer")} type="button">
                escolher viewer
            </button>
        </div>
    ),
}));

const { BoardMembersClient } = await import(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/members/BoardMembersClient"
);

describe("diálogo Mudar papel na tela de membros", () => {
    beforeEach(() => {
        hookState.isFetching = false;
        changeRoleMock.mockReset();
        changeRoleMock.mockResolvedValue(undefined);
    });
    afterEach(cleanup);

    it("mantém o papel escolhido quando a tela renderiza de novo com o diálogo aberto", async () => {
        const { rerender } = render(<BoardMembersClient />);

        fireEvent.click(
            screen.getByRole("button", { name: "abrir qa-writer" })
        );
        await waitFor(() =>
            expect(screen.getByTestId("role-value").textContent).toBe(
                "operator"
            )
        );

        fireEvent.click(
            screen.getByRole("button", { name: "escolher viewer" })
        );
        expect(screen.getByTestId("role-value").textContent).toBe("viewer");

        hookState.isFetching = true;
        rerender(<BoardMembersClient />);
        hookState.isFetching = false;
        rerender(<BoardMembersClient />);

        expect(screen.getByTestId("role-value").textContent).toBe("viewer");

        fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(changeRoleMock).toHaveBeenCalledTimes(1));
        expect(changeRoleMock.mock.calls[0][0]).toMatchObject({
            role: "viewer",
            member: { login: "qa-writer" },
        });
    });

    it("não oferece mudar o papel do dono nem o da própria pessoa", () => {
        render(<BoardMembersClient />);

        expect(
            screen.queryByRole("button", { name: "abrir qa-owner" })
        ).toBeNull();
        expect(
            screen.getByRole("button", { name: "abrir qa-writer" })
        ).toBeTruthy();
    });
});
