import type { GithubIdentity } from "@repo/kanban-contract";

export type UserPreferences = {
    theme: "light" | "dark" | "system";
    locale: "pt-br";
};

export type UserDTO = {
    id: string;
    reference_id: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    phone?: string | null;
    avatar?: string | null;
    preferences?: UserPreferences | null;
    /** Written by the server from Firebase on each GitHub sign-in; absent on password accounts. */
    github?: GithubIdentity | null;
};

export type UserWithAuthDTO = UserDTO & {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    photoURL: string | null;
    phoneNumber: string | null;
    disabled: boolean;
    metadata: {
        creationTime: string;
        lastSignInTime: string;
        lastRefreshTime?: string | null;
    };
    providerData: Array<{
        providerId: string;
        uid: string;
        displayName: string | null;
        email: string | null;
        phoneNumber: string | null;
    }>;
    customClaims: Record<string, unknown> | null;
    tokensValidAfterTime?: string;
};
