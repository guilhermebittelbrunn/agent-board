"use client";

import { getDictionary } from "@repo/internationalization/client";
import {
    type BoardRole,
    canChangeMember,
    canManageMembers,
    grantableRoles,
} from "@repo/kanban-contract";
import type { BoardMemberDTO } from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { COMMON_ROUTES } from "../../../../../paths";
import { BoardMembersTable } from "../../../(components)/BoardMembersTable";
import { BoardRolesGuide } from "../../../(components)/BoardRolesGuide";
import { BoardSectionNav } from "../../../(components)/BoardSectionNav";
import { ChangeMemberRoleDialog } from "../../../(components)/ChangeMemberRoleDialog";
import { InviteMemberForm } from "../../../(components)/InviteMemberForm";
import { useBoardMemberCrud } from "../../../(hooks)/useBoardMemberCrud";
import { useFindBoardById } from "../../../(hooks)/useFindBoardById";
import { useListBoardMembers } from "../../../(hooks)/useListBoardMembers";

export function BoardMembersClient() {
    const params = useParams<{ id: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const {
        data: board,
        isLoading: isBoardLoading,
        error: boardError,
    } = useFindBoardById(id);
    const {
        data: members,
        isLoading: areMembersLoading,
        error: membersError,
        refetch,
        isFetching,
    } = useListBoardMembers(id);
    const {
        inviteMemberMutation,
        changeMemberRoleMutation,
        removeMemberMutation,
    } = useBoardMemberCrud(id);
    const [memberToChange, setMemberToChange] = useState<BoardMemberDTO | null>(
        null
    );
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const membersCopy = boardsDictionary.members;

    const error = boardError ?? membersError;
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isLoading = isBoardLoading || areMembersLoading;

    const actorRole: BoardRole | null = board?.access.effectiveRole ?? null;
    const canManage = canManageMembers(actorRole);
    const rolesToGrant = useMemo(
        () => (canManage ? grantableRoles(actorRole) : []),
        [canManage, actorRole]
    );
    const selfMemberId = members.find((member) => member.isSelf)?.id ?? "";
    const canChange = (member: BoardMemberDTO) =>
        canManage &&
        canChangeMember({ id: selfMemberId, role: actorRole }, member);

    return (
        <>
            <Header
                breadcrumbs={[
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                ]}
                page={board?.name ?? membersCopy.title}
            />
            <Container
                header={
                    <div className="flex flex-col gap-4">
                        <BoardSectionNav
                            active="members"
                            boardsDictionary={boardsDictionary}
                            links={{
                                board: routes.boards.detail(id).url,
                                settings: routes.boards.settings(id).url,
                                members: routes.boards.members(id).url,
                                credentials: routes.boards.credentials(id).url,
                            }}
                        />
                        <PageHeader
                            description={membersCopy.subtitle}
                            title={membersCopy.title}
                        />
                    </div>
                }
                loadError={
                    loadError ??
                    (board || isLoading ? null : membersCopy.loadError)
                }
                loading={isLoading}
            >
                {board ? (
                    <div className="flex w-full flex-col gap-6">
                        {rolesToGrant.length > 0 ? (
                            <InviteMemberForm
                                boardsDictionary={boardsDictionary}
                                grantableRoles={rolesToGrant}
                                isSubmitting={inviteMemberMutation.isPending}
                                onInvite={(values) =>
                                    inviteMemberMutation.mutateAsync(values)
                                }
                            />
                        ) : null}
                        <BoardMembersTable
                            boardsDictionary={boardsDictionary}
                            canChange={canChange}
                            isRefreshing={isFetching}
                            members={members}
                            onChangeRole={setMemberToChange}
                            onRefresh={() => refetch()}
                            onRemove={(member) =>
                                removeMemberMutation.mutate(member)
                            }
                        />
                        <BoardRolesGuide boardsDictionary={boardsDictionary} />
                        <ChangeMemberRoleDialog
                            boardsDictionary={boardsDictionary}
                            grantableRoles={rolesToGrant}
                            isSaving={changeMemberRoleMutation.isPending}
                            member={memberToChange}
                            onClose={() => setMemberToChange(null)}
                            onSave={(member, role) =>
                                changeMemberRoleMutation.mutateAsync({
                                    member,
                                    role,
                                })
                            }
                        />
                    </div>
                ) : null}
            </Container>
        </>
    );
}
