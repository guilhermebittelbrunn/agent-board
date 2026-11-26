"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HookFormSelect } from "@repo/design-system/components/form/hookform";
import { Button } from "@repo/design-system/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Form } from "@repo/design-system/components/ui/form";
import type { InvitableBoardRole } from "@repo/kanban-contract";
import type { BoardMemberDTO } from "@repo/sdk/src/types";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
    buildChangeMemberRoleSchema,
    type ChangeMemberRoleFormValues,
} from "../(validations)/inviteMemberSchema";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

const changeMemberRoleSchema = buildChangeMemberRoleSchema();

type ChangeMemberRoleDialogProps = {
    member: BoardMemberDTO | null;
    grantableRoles: InvitableBoardRole[];
    isSaving: boolean;
    onClose: () => void;
    onSave: (
        member: BoardMemberDTO,
        role: InvitableBoardRole
    ) => Promise<unknown>;
    boardsDictionary: BoardsDictionary;
};

const isInvitable = (
    role: BoardMemberDTO["role"],
    grantable: InvitableBoardRole[]
): role is InvitableBoardRole => (grantable as string[]).includes(role);

export function ChangeMemberRoleDialog({
    member,
    grantableRoles,
    isSaving,
    onClose,
    onSave,
    boardsDictionary,
}: ChangeMemberRoleDialogProps) {
    const changeRoleCopy = boardsDictionary.members.changeRole;
    const form = useForm<ChangeMemberRoleFormValues>({
        resolver: zodResolver(changeMemberRoleSchema),
        defaultValues: { role: grantableRoles[0] ?? "viewer" },
    });

    useEffect(() => {
        if (member) {
            form.reset({
                role: isInvitable(member.role, grantableRoles)
                    ? member.role
                    : (grantableRoles[0] ?? "viewer"),
            });
        }
    }, [member, grantableRoles, form]);

    const roleOptions = grantableRoles.map((role) => ({
        value: role,
        label: boardsDictionary.roles[role],
    }));

    const onSubmit = async ({ role }: ChangeMemberRoleFormValues) => {
        if (!member) {
            return;
        }
        try {
            await onSave(member, role);
            onClose();
        } catch {
            // The mutation already showed the error; the dialog stays open for a retry.
        }
    };

    return (
        <Dialog
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
            open={member !== null}
        >
            <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>
                        {fillMessage(changeRoleCopy.title, {
                            login: member?.login,
                        })}
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form
                        className="flex flex-col gap-4"
                        noValidate
                        onSubmit={form.handleSubmit(onSubmit)}
                    >
                        <HookFormSelect
                            label={changeRoleCopy.role}
                            name="role"
                            options={roleOptions}
                            required
                            searchable={false}
                        />
                        <DialogFooter>
                            <Button
                                onClick={onClose}
                                type="button"
                                variant="outline"
                            >
                                {changeRoleCopy.cancel}
                            </Button>
                            <Button loading={isSaving} type="submit">
                                {changeRoleCopy.save}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
