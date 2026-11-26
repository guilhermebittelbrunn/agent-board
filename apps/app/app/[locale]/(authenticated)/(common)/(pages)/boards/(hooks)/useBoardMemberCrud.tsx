import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import type {
    BoardMemberDTO,
    InvitableBoardRole,
    InviteBoardMemberRequest,
} from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/client";
import { queryKeys } from "@/shared/lib/queryKeys";
import { fillMessage } from "../(components)/boardConfigIssueMessage";

type ChangeRoleInput = { member: BoardMemberDTO; role: InvitableBoardRole };

export const useBoardMemberCrud = (boardId: string) => {
    const { successAlert, errorAlert } = useAlert();
    const { dictionary, locale } = getDictionary();
    const queryClient = useQueryClient();
    const membersCopy = dictionary.apps.app.pages.common.boards.members;

    const showError = (error: unknown) =>
        errorAlert(handleClientError(new FormattedError(error, locale)));

    const refreshMembers = () =>
        queryClient.invalidateQueries({
            queryKey: queryKeys.boards.members(boardId),
        });

    const inviteMemberMutation = useMutation({
        mutationFn: (body: InviteBoardMemberRequest) =>
            apiClient.boardMember.invite(boardId, body),
        onSuccess: async (member) => {
            successAlert(
                fillMessage(membersCopy.invite.success, { login: member.login })
            );
            await refreshMembers();
        },
        onError: showError,
    });

    const changeMemberRoleMutation = useMutation({
        mutationFn: ({ member, role }: ChangeRoleInput) =>
            apiClient.boardMember.updateRole(boardId, member.id, { role }),
        onSuccess: async (member) => {
            successAlert(
                fillMessage(membersCopy.changeRole.success, {
                    login: member.login,
                })
            );
            await refreshMembers();
        },
        onError: showError,
    });

    const removeMemberMutation = useMutation({
        mutationFn: (member: BoardMemberDTO) =>
            apiClient.boardMember.remove(boardId, member.id),
        onSuccess: async (_result, member) => {
            const template =
                member.status === "pending"
                    ? membersCopy.actions.inviteCanceled
                    : membersCopy.actions.removed;
            successAlert(fillMessage(template, { login: member.login }));
            await refreshMembers();
        },
        onError: showError,
    });

    return {
        inviteMemberMutation,
        changeMemberRoleMutation,
        removeMemberMutation,
    };
};
