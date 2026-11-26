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

/** The Firebase ID token of the GitHub popup sign-in, never the GitHub access token. */
export type GithubSignInRequest = {
    idToken: string;
};

export type GithubSignInResponse = {
    user: AuthMePayload;
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

    /** Creates the profile on first sign-in and syncs the GitHub identity stored on it. */
    async signInWithGithub(
        body: GithubSignInRequest
    ): Promise<GithubSignInResponse> {
        const { data } = await this.client.request<GithubSignInResponse>({
            url: "/auth/sign-in/github",
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
