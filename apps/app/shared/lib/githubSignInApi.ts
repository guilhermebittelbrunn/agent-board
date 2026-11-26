"use client";

import { getAuthClient, isNewAccount } from "@repo/auth/client";
import { getDictionary } from "@repo/internationalization/client";
import type { AuthMePayload } from "@repo/sdk/src/actions/auth/action";
import {
    GithubAuthProvider,
    signInWithPopup,
    signOut,
    type UserCredential,
} from "firebase/auth";
import { apiClient } from "@/shared/lib/client";

export type GithubApiSignInResult = {
    idToken: string;
    user: AuthMePayload;
};

export type GithubApiSignInOptions = {
    onAccountCreated?: () => void;
};

const sessionUrl = (): string =>
    `${typeof window === "undefined" ? "" : window.location.origin}/api/auth/session`;

/**
 * GitHub popup (Firebase client) → Firebase ID token → API, which reads the GitHub
 * identity back from Firebase. The GitHub access token stays inside the Firebase SDK.
 */
export async function signInWithGithubViaApi({
    onAccountCreated,
}: GithubApiSignInOptions = {}): Promise<GithubApiSignInResult> {
    const auth = getAuthClient();
    const result = await signInWithPopup(auth, new GithubAuthProvider());

    // Reported here and not after the API exchange: the sign-in screen follows a
    // successful exchange with a full page load, which can drop an event sent after it.
    if (isNewAccount(result)) {
        onAccountCreated?.();
    }

    // The popup has already signed the Firebase client in, and the auth provider may
    // already be writing the session cookie from it. If the API turns the account away,
    // both have to go, or the screens keep treating it as signed in.
    try {
        return await exchangeForApiSession(result);
    } catch (error) {
        await signOut(auth).catch(() => null);
        await fetch(sessionUrl(), {
            method: "DELETE",
            credentials: "include",
        }).catch(() => null);
        throw error;
    }
}

async function exchangeForApiSession(
    result: UserCredential
): Promise<GithubApiSignInResult> {
    const idToken = await result.user.getIdToken();

    const { user } = await apiClient.authApi.signInWithGithub({ idToken });

    const sessionRes = await fetch(sessionUrl(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
    }).catch(() => null);

    if (!sessionRes?.ok) {
        throw new Error(
            getDictionary().dictionary.packages.auth.provider.session
                .notEstablished
        );
    }

    apiClient.setAuthorizationHeader(idToken);

    return { idToken, user };
}
