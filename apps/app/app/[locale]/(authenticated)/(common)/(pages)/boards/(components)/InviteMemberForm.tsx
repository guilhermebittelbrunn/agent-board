"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    HookFormInput,
    HookFormSelect,
} from "@repo/design-system/components/form/hookform";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Form } from "@repo/design-system/components/ui/form";
import { getDictionary } from "@repo/internationalization/client";
import type { InvitableBoardRole } from "@repo/kanban-contract";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import {
    buildInviteMemberSchema,
    type InviteMemberFormValues,
} from "../(validations)/inviteMemberSchema";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type InviteMemberFormProps = {
    grantableRoles: InvitableBoardRole[];
    isSubmitting: boolean;
    onInvite: (values: InviteMemberFormValues) => Promise<unknown>;
    boardsDictionary: BoardsDictionary;
};

export function InviteMemberForm({
    grantableRoles,
    isSubmitting,
    onInvite,
    boardsDictionary,
}: InviteMemberFormProps) {
    const { dictionary } = getDictionary();
    const inviteCopy = boardsDictionary.members.invite;
    const schema = useMemo(
        () => buildInviteMemberSchema(dictionary),
        [dictionary]
    );
    const form = useForm<InviteMemberFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { login: "", role: grantableRoles[0] ?? "viewer" },
    });

    const roleOptions = grantableRoles.map((role) => ({
        value: role,
        label: boardsDictionary.roles[role],
    }));

    const onSubmit = async (values: InviteMemberFormValues) => {
        try {
            await onInvite(values);
            form.reset({ login: "", role: values.role });
        } catch {
            // The mutation already showed the error; the typed login stays for a retry.
        }
    };

    return (
        <Card className="gap-4 p-5">
            <h2 className="font-semibold text-lg">{inviteCopy.title}</h2>
            <Form {...form}>
                <form
                    className="flex flex-col gap-3"
                    noValidate
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]">
                        <HookFormInput
                            autoCapitalize="none"
                            autoComplete="off"
                            label={inviteCopy.login}
                            name="login"
                            placeholder={inviteCopy.loginPlaceholder}
                            required
                            spellCheck={false}
                            type="text"
                        />
                        <HookFormSelect
                            label={inviteCopy.role}
                            name="role"
                            options={roleOptions}
                            required
                            searchable={false}
                        />
                        <Button
                            className="md:mt-[1.375rem]"
                            loading={isSubmitting}
                            type="submit"
                        >
                            {inviteCopy.submit}
                        </Button>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        {inviteCopy.hint}
                    </p>
                </form>
            </Form>
        </Card>
    );
}
