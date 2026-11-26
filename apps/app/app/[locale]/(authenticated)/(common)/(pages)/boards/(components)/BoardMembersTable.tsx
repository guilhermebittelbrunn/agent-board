"use client";

import { ActionsMenu, Table } from "@repo/design-system/components/ui";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { Badge } from "@repo/design-system/components/ui/badge";
import { BOARD_ROLES, type BoardRole } from "@repo/kanban-contract";
import type { BoardMemberDTO } from "@repo/sdk/src/types";
import { EditIcon } from "lucide-react";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type BoardMembersTableProps = {
    members: BoardMemberDTO[];
    canChange: (member: BoardMemberDTO) => boolean;
    onChangeRole: (member: BoardMemberDTO) => void;
    onRemove: (member: BoardMemberDTO) => void;
    onRefresh: () => void;
    isRefreshing: boolean;
    boardsDictionary: BoardsDictionary;
};

const initialsOf = (login: string) =>
    login
        .split("-")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

const isBelow = (effective: BoardRole, role: BoardRole) =>
    BOARD_ROLES.indexOf(effective) < BOARD_ROLES.indexOf(role);

export function BoardMembersTable({
    members,
    canChange,
    onChangeRole,
    onRemove,
    onRefresh,
    isRefreshing,
    boardsDictionary,
}: BoardMembersTableProps) {
    const formatDateTime = useFormatDisplayDateTime();
    const membersCopy = boardsDictionary.members;
    const tableCopy = membersCopy.table;
    const actionsCopy = membersCopy.actions;
    const roles = boardsDictionary.roles;

    const effectiveRoleCell = (member: BoardMemberDTO) => {
        if (member.status === "pending") {
            return <Badge variant="outline">{tableCopy.pending}</Badge>;
        }
        if (member.githubRole === null) {
            return (
                <span className="text-muted-foreground">
                    {tableCopy.checksOnJoin}
                </span>
            );
        }
        if (member.effectiveRole === null) {
            return (
                <div className="flex flex-col items-start gap-1">
                    <Badge variant="destructive">{tableCopy.noAccess}</Badge>
                    <span className="text-muted-foreground text-xs">
                        {tableCopy.leftRepository}
                    </span>
                </div>
            );
        }
        const limited = isBelow(member.effectiveRole, member.role);
        return (
            <div className="flex flex-col items-start gap-1">
                <Badge variant="secondary">{roles[member.effectiveRole]}</Badge>
                {limited ? (
                    <span className="text-muted-foreground text-xs">
                        {tableCopy.limitedByGithub}
                    </span>
                ) : null}
            </div>
        );
    };

    const checkedAtCell = (member: BoardMemberDTO) => {
        if (member.status === "pending") {
            return fillMessage(tableCopy.invitedAt, {
                date: formatDateTime(member.createdAt),
            });
        }
        return member.githubRoleCheckedAt
            ? formatDateTime(member.githubRoleCheckedAt)
            : tableCopy.noActions;
    };

    const actionsCell = (member: BoardMemberDTO) => {
        if (!canChange(member)) {
            return (
                <span className="text-muted-foreground">
                    {tableCopy.noActions}
                </span>
            );
        }
        const pending = member.status === "pending";
        return (
            <ActionsMenu
                deleteLabels={{
                    action: pending
                        ? actionsCopy.cancelInvite
                        : actionsCopy.remove,
                    confirmTitle: fillMessage(
                        pending
                            ? actionsCopy.cancelInviteConfirmTitle
                            : actionsCopy.removeConfirmTitle,
                        { login: member.login }
                    ),
                    confirmDescription: pending
                        ? ""
                        : actionsCopy.removeConfirmDescription,
                }}
                items={
                    pending
                        ? []
                        : [
                              {
                                  icon: <EditIcon className="size-4" />,
                                  key: "change-role",
                                  label: actionsCopy.changeRole,
                                  onClick: () => onChangeRole(member),
                              },
                          ]
                }
                onDelete={() => onRemove(member)}
                triggerLabel={fillMessage(tableCopy.actionsAria, {
                    login: member.login,
                })}
            />
        );
    };

    const columns = [
        {
            title: tableCopy.member,
            dataIndex: "login",
            render: (_: unknown, member: BoardMemberDTO) => (
                <div className="flex items-center gap-3">
                    <Avatar
                        aria-label={fillMessage(tableCopy.avatarAria, {
                            login: member.login,
                        })}
                        className="size-8"
                        role="img"
                    >
                        {member.avatarUrl ? (
                            <AvatarImage alt="" src={member.avatarUrl} />
                        ) : null}
                        <AvatarFallback className="text-xs">
                            {initialsOf(member.login)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="font-medium">{member.login}</span>
                        {member.isSelf ? (
                            <span className="text-muted-foreground text-xs">
                                {tableCopy.you}
                            </span>
                        ) : null}
                    </div>
                </div>
            ),
        },
        {
            title: tableCopy.boardRole,
            dataIndex: "role",
            render: (role: BoardRole) => roles[role],
        },
        {
            title: tableCopy.githubRole,
            dataIndex: "githubRole",
            render: (githubRole: string | null) =>
                githubRole ? (
                    <code className="font-mono text-sm">{githubRole}</code>
                ) : (
                    <span className="text-muted-foreground">
                        {tableCopy.checksOnJoin}
                    </span>
                ),
        },
        {
            title: tableCopy.effectiveRole,
            dataIndex: "effectiveRole",
            render: (_: unknown, member: BoardMemberDTO) =>
                effectiveRoleCell(member),
        },
        {
            title: tableCopy.checkedAt,
            dataIndex: "githubRoleCheckedAt",
            render: (_: unknown, member: BoardMemberDTO) => (
                <span className="text-muted-foreground">
                    {checkedAtCell(member)}
                </span>
            ),
        },
        {
            title: tableCopy.actions,
            dataIndex: "actions",
            align: "center" as const,
            render: (_: unknown, member: BoardMemberDTO) => actionsCell(member),
        },
    ];

    return (
        <Table<BoardMemberDTO>
            columns={columns}
            dataSource={members}
            onRefresh={onRefresh}
            pagination={false}
            refreshLoading={isRefreshing}
            rowKey={(row) => row.id}
        />
    );
}
