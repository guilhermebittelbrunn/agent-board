"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import useAuth from "@repo/auth/provider";
import { HookFormInputPassword } from "@repo/design-system/components/form/hookform";
import { Form } from "@repo/design-system/components/ui/form";
import { getDictionary } from "@repo/internationalization/client";
import type { AccountDTO } from "@repo/sdk/src/types";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { Footer } from "@/shared/components/ui/Footer";
import { FormContainer } from "@/shared/components/ui/FormContainer";
import { SettingsSection } from "@/shared/components/ui/SettingsSection";
import { lacksPasswordProvider } from "@/shared/lib/signInMethods";
import { useAuthRequestPanel } from "@/shared/providers/AuthRequestPanelContext";
import { useAccountMutations } from "../(hooks)/useAccountMutations";
import {
    type AccountPasswordFormValues,
    buildAccountPasswordSchema,
} from "../(validations)/accountFormSchema";

type AccountSecurityFormProps = {
    account: AccountDTO | undefined;
};

export function AccountSecurityForm({ account }: AccountSecurityFormProps) {
    const { dictionary } = getDictionary();
    const { isImpersonating } = useAuthRequestPanel();
    const { signOut } = useAuth();
    const accountSecurity = dictionary.apps.app.pages.common.account.security;
    const { changePasswordMutation } = useAccountMutations();

    const schema = useMemo(
        () => buildAccountPasswordSchema(dictionary),
        [dictionary]
    );

    const form = useForm<AccountPasswordFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            currentPassword: "",
            password: "",
            confirmPassword: "",
        },
    });

    // A password change revokes every Firebase session of the account, this one
    // included: staying on it would only fail the next request.
    const onSubmit = (values: AccountPasswordFormValues) => {
        changePasswordMutation.mutate(
            {
                currentPassword: values.currentPassword,
                password: values.password,
            },
            { onSuccess: () => signOut.mutate() }
        );
    };

    return (
        <div className="flex w-full flex-1 flex-col gap-6">
            {lacksPasswordProvider(account) ? (
                <SettingsSection
                    description={accountSecurity.passwordUnavailable}
                    title={accountSecurity.passwordTitle}
                />
            ) : (
                <SettingsSection
                    description={accountSecurity.description}
                    title={accountSecurity.passwordTitle}
                >
                    <Form {...form}>
                        <form
                            className="flex w-full flex-col"
                            onSubmit={form.handleSubmit(onSubmit)}
                        >
                            <FormContainer>
                                <div className="col-span-1 md:col-span-2">
                                    <HookFormInputPassword
                                        label={accountSecurity.currentPassword}
                                        name="currentPassword"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <HookFormInputPassword
                                        label={accountSecurity.newPassword}
                                        name="password"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <HookFormInputPassword
                                        label={accountSecurity.confirmPassword}
                                        name="confirmPassword"
                                    />
                                </div>
                            </FormContainer>
                            <Footer
                                confirmLabel={accountSecurity.save}
                                disabled={isImpersonating}
                                isLoading={changePasswordMutation.isPending}
                                showBack={false}
                                sticky={false}
                            />
                        </form>
                    </Form>
                </SettingsSection>
            )}
        </div>
    );
}
