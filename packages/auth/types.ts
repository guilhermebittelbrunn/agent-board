import type { User } from "firebase/auth";

export type UserDTO = User;

/** `unknown` means the API could not answer, which is never read as a refusal. */
export type SessionStanding = "active" | "revoked" | "unknown";

/**
 * What the front-ends ask the API before writing the shared session cookie and when they
 * sign out: the API is the only one that knows a session was ended from another device.
 */
export type SessionAuthority = {
    check: (
        credential: string,
        userAgent: string | null
    ) => Promise<SessionStanding>;
    end: (credential: string) => Promise<void>;
};

export type SignInDTO = {
    email: string;
    password: string;
};
