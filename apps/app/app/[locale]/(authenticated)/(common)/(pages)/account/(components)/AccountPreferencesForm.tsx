"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HookFormRadioGroup } from "@repo/design-system/components/form/hookform";
import { Form } from "@repo/design-system/components/ui/form";
import type { RadioOption } from "@repo/design-system/components/ui/radio-group-input";
import { getDictionary } from "@repo/internationalization/client";
import type { AccountDTO } from "@repo/sdk/src/types";
import { useTheme } from "next-themes";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Footer } from "@/shared/components/ui/Footer";
import { FormContainer } from "@/shared/components/ui/FormContainer";
import { SettingsSection } from "@/shared/components/ui/SettingsSection";
import { storeActiveTheme } from "@/shared/lib/themePreference";
import { useAuthRequestPanel } from "@/shared/providers/AuthRequestPanelContext";
import { useAccountMutations } from "../(hooks)/useAccountMutations";
import {
    type AccountPreferencesFormValues,
    accountThemeValues,
    buildAccountPreferencesSchema,
} from "../(validations)/accountFormSchema";

type AccountPreferencesFormProps = {
    account: AccountDTO | undefined;
};

export function AccountPreferencesForm({
    account,
}: AccountPreferencesFormProps) {
    const { dictionary } = getDictionary();
    const { setTheme } = useTheme();
    const { isImpersonating } = useAuthRequestPanel();
    const accountPreferences =
        dictionary.apps.app.pages.common.account.preferences;
    const { updatePreferencesMutation } = useAccountMutations();

    const schema = useMemo(() => buildAccountPreferencesSchema(), []);

    const form = useForm<AccountPreferencesFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { theme: "system" },
    });

    useEffect(() => {
        if (account) {
            form.reset({ theme: account.preferences.theme });
        }
    }, [account, form]);

    const themeOptions = useMemo<RadioOption[]>(
        () =>
            accountThemeValues.map((value) => ({
                value,
                label: accountPreferences.themeOptions[value],
            })),
        [accountPreferences.themeOptions]
    );

    const onSubmit = (values: AccountPreferencesFormValues) => {
        updatePreferencesMutation.mutate(
            { preferences: values },
            {
                onSuccess: () => {
                    setTheme(values.theme);
                    storeActiveTheme(values.theme);
                },
            }
        );
    };

    return (
        <SettingsSection
            description={accountPreferences.description}
            title={accountPreferences.title}
        >
            <Form {...form}>
                <form
                    className="flex w-full flex-1 flex-col"
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <FormContainer>
                        <div className="col-span-1 md:col-span-2">
                            <HookFormRadioGroup
                                label={accountPreferences.theme}
                                name="theme"
                                options={themeOptions}
                            />
                        </div>
                    </FormContainer>
                    <Footer
                        confirmLabel={accountPreferences.save}
                        disabled={isImpersonating}
                        isLoading={updatePreferencesMutation.isPending}
                        showBack={false}
                        sticky={false}
                    />
                </form>
            </Form>
        </SettingsSection>
    );
}
