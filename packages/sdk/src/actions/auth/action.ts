import type BaseClient from "../../client/base";
import type { Response } from "../../client/type";
import type { UserPreferences, UserType } from "../../types";

/** Only what the front-ends read. A field the API adds to the profile stays out until it is listed here. */
export type AuthMePayload = {
    uid: string;
    type: UserType | null;
    email: string | null;
    preferences: UserPreferences | null;
};

export type GoogleSignInRequest = {
    idToken: string;
    requestUri: string;
};

export type GoogleSignInSession = {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
};

export type GoogleSignInResponse = {
    session: GoogleSignInSession;
    user: AuthMePayload | null;
};

export type AuthSessionStanding = { active: true };

/**
 * The front-ends ask on the way to writing the session cookie and from their proxy, so a
 * slow API has to give up before it holds a page load hostage.
 */
const SESSION_STANDING_TIMEOUT_MS = 3000;

export default class AuthActions {
    private readonly client: BaseClient;

    constructor(client: BaseClient) {
        this.client = client;
    }

    async me(): Promise<AuthMePayload> {
        const { data } = await this.client.request<Response<AuthMePayload>>({
            url: "/auth/me",
            method: "GET",
        });

        return data.data;
    }

    /**
     * Google popup (Firebase client) → Google ID token → API `/auth/sign-in/google`,
     * returning the same `session` + merged `user` shape as e-mail/password sign-in.
     */
    async signInWithGoogle(
        body: GoogleSignInRequest
    ): Promise<GoogleSignInResponse> {
        const { data } = await this.client.request<GoogleSignInResponse>({
            url: "/auth/sign-in/google",
            method: "POST",
            data: body,
        });

        return data;
    }

    /** Answers 401 `AUTH_SESSION_REVOKED` for a session ended from another device. */
    async sessionStanding(): Promise<AuthSessionStanding> {
        const { data } = await this.client.request<
            Response<AuthSessionStanding>
        >({
            url: "/auth/session",
            method: "GET",
            timeout: SESSION_STANDING_TIMEOUT_MS,
        });

        return data.data;
    }

    async endSession(): Promise<void> {
        await this.client.request({
            url: "/auth/session",
            method: "DELETE",
            timeout: SESSION_STANDING_TIMEOUT_MS,
        });
    }
}
