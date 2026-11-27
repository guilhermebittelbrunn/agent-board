"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ANALYTICS_EVENT } from "@repo/analytics/events";
import { useAnalyticsEvent } from "@repo/analytics/events-context";
import useAuth from "@repo/auth/provider";
import {
    HookFormInput,
    HookFormInputPassword,
} from "@repo/design-system/components/form/hookform";
import { Button } from "@repo/design-system/components/ui/button";
import { Form } from "@repo/design-system/components/ui/form";
import useAlert from "@repo/design-system/hooks/useAlert";
import { getDictionary } from "@repo/internationalization/client";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useMutation } from "@tanstack/react-query";
import type { UserCredential } from "firebase/auth";
import { KeyRoundIcon, ShieldIcon } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { FaGithub } from "react-icons/fa";
import { FullScreenLoader } from "@/shared/components/ui/FullScreenLoader";
import { useSignedInRedirect } from "@/shared/hooks/useSignedInRedirect";
import { apiClient } from "@/shared/lib/client";
import { isEmulatorSignInEnabled } from "@/shared/lib/emulatorSignIn";
import { signInWithGithubViaApi } from "@/shared/lib/githubSignInApi";
import { resolveAppPostLoginPath } from "@/shared/lib/postLoginNavigation";
import {
    buildSignInSchema,
    type SignInFormValues,
} from "../validations/signInSchema";

export const SignInForm = () => {
    const { dictionary, locale } = getDictionary();
    const { errorAlert, successAlert } = useAlert();
    const { signIn, user, loading: authLoading } = useAuth();
    useSignedInRedirect();

    const trackEvent = useAnalyticsEvent();

    const githubSignIn = useMutation({
        mutationFn: () =>
            signInWithGithubViaApi({
                onAccountCreated: () =>
                    trackEvent(ANALYTICS_EVENT.signUp, { method: "github" }),
            }),
        onError: (error) =>
            errorAlert(handleClientError(new FormattedError(error, locale))),
        onSuccess: async (result) => {
            successAlert(dictionary.packages.auth.provider.onSuccess);
            const path = await resolveAppPostLoginPath({
                idToken: result.idToken,
                locale,
                fallbackPath: `/${locale}/boards`,
            });
            window.location.replace(path);
        },
    });

    const isLoading = signIn.isPending || githubSignIn.isPending;
    const signInCopy = dictionary.apps.app.pages.signIn;
    const showEmulatorAccess = isEmulatorSignInEnabled();

    const schema = useMemo(() => buildSignInSchema(dictionary), [dictionary]);

    const form = useForm<SignInFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const handleSuccessSignIn = async (credentials: UserCredential) => {
        const accessToken = await credentials.user.getIdToken();

        if (accessToken) {
            apiClient.setAuthorizationHeader(accessToken);
        }
    };

    if (authLoading || user) {
        return <FullScreenLoader />;
    }

    return (
        <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center px-4 py-20 sm:px-0">
            <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
                <div className="space-y-2">
                    <h1 className="font-semibold text-2xl">
                        {signInCopy.meta.title}
                    </h1>
                    <p className="text-muted-foreground">
                        {signInCopy.enterWithYourAccount}
                    </p>
                </div>

                <Button
                    className="w-full"
                    disabled={isLoading}
                    loading={githubSignIn.isPending}
                    onClick={() => githubSignIn.mutate()}
                    size="lg"
                    type="button"
                >
                    <FaGithub aria-hidden />
                    {signInCopy.githubSignIn}
                </Button>

                <ul className="space-y-3 border-t pt-5 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2.5">
                        <ShieldIcon
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-primary"
                        />
                        <span>{signInCopy.permissionNote}</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                        <KeyRoundIcon
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-primary"
                        />
                        <span>{signInCopy.tokenNote}</span>
                    </li>
                </ul>

                {showEmulatorAccess && (
                    <>
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground">
                                    {signInCopy.emulatorAccess}
                                </span>
                            </div>
                        </div>

                        <Form {...form}>
                            <form
                                className="space-y-4"
                                noValidate
                                onSubmit={form.handleSubmit((data) =>
                                    signIn.mutate(
                                        { ...data },
                                        { onSuccess: handleSuccessSignIn }
                                    )
                                )}
                            >
                                <HookFormInput
                                    label={signInCopy.form.email}
                                    name="email"
                                    placeholder={
                                        signInCopy.form.emailPlaceholder
                                    }
                                    type="email"
                                />

                                <HookFormInputPassword
                                    label={signInCopy.form.password}
                                    name="password"
                                    placeholder={
                                        signInCopy.form.passwordPlaceholder
                                    }
                                />

                                <Button
                                    className="w-full"
                                    disabled={isLoading}
                                    loading={signIn.isPending}
                                    type="submit"
                                    variant="outline"
                                >
                                    {signInCopy.form.submit}
                                </Button>
                            </form>
                        </Form>
                    </>
                )}
            </div>
        </div>
    );
};
