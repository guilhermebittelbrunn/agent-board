import { authEmulatorOrigin, DEMO_WEB_API_KEY } from "@repo/auth/emulator";
import { keys } from "@repo/auth/keys";

const PRODUCTION_BASE = "https://identitytoolkit.googleapis.com/v1";

/**
 * The Auth emulator serves the same REST API under the production host repeated as a
 * path segment. Resolved per call rather than once at import time so the value tracks
 * the environment instead of being frozen at module load.
 */
const base = (): string => {
    const origin = authEmulatorOrigin();
    return origin
        ? `${origin}/identitytoolkit.googleapis.com/v1`
        : PRODUCTION_BASE;
};

type ToolkitSuccess = {
    localId: string;
    idToken: string;
    refreshToken: string;
    expiresIn: string;
};

type ToolkitErrorBody = {
    error?: { message?: string; code?: number };
};

export class IdentityToolkitError extends Error {
    readonly code: number | undefined;

    constructor(message: string, code?: number) {
        super(message);
        this.name = "IdentityToolkitError";
        this.code = code;
    }
}

function getWebApiKey(): string {
    const k = keys().FIREBASE_WEB_API_KEY;
    if (!k) {
        // The emulator accepts any key, so requiring a real one would block the local
        // setup for nothing. Production still has to supply one.
        if (authEmulatorOrigin()) {
            return DEMO_WEB_API_KEY;
        }
        throw new IdentityToolkitError(
            "FIREBASE_WEB_API_KEY or NEXT_PUBLIC_FIREBASE_API_KEY is not configured"
        );
    }
    return k;
}

async function parseToolkitJson<T>(
    res: Response,
    fallbackMessage: string
): Promise<T> {
    const data = (await res.json()) as T & ToolkitErrorBody;
    if (!res.ok || data.error) {
        throw new IdentityToolkitError(
            data.error?.message ?? fallbackMessage,
            data.error?.code
        );
    }
    return data;
}

function parseToolkitResponse(res: Response): Promise<ToolkitSuccess> {
    return parseToolkitJson<ToolkitSuccess>(
        res,
        "Authentication request failed"
    );
}

export async function identitySignUp(
    email: string,
    password: string
): Promise<ToolkitSuccess> {
    const key = getWebApiKey();
    const res = await fetch(`${base()}/accounts:signUp?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
        }),
    });
    return parseToolkitResponse(res);
}

export async function identitySignInWithPassword(
    email: string,
    password: string
): Promise<ToolkitSuccess> {
    const key = getWebApiKey();
    const res = await fetch(
        `${base()}/accounts:signInWithPassword?key=${key}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                returnSecureToken: true,
            }),
        }
    );
    return parseToolkitResponse(res);
}

type ToolkitResetPassword = { email: string; requestType: string };

export type ToolkitApplyOob = {
    localId: string;
    email: string;
    emailVerified: boolean;
    /** Only on an email change: the address the account moved to. */
    newEmail?: string;
};

export type ToolkitCheckOob = {
    requestType: string;
    /** The address the code was issued for — on an email change, the one being left. */
    email?: string;
    newEmail?: string;
};

/** Consumes a password-reset action code and sets the new password. */
export async function identityResetPassword(
    oobCode: string,
    newPassword: string
): Promise<ToolkitResetPassword> {
    const key = getWebApiKey();
    const res = await fetch(`${base()}/accounts:resetPassword?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode, newPassword }),
    });
    return parseToolkitJson<ToolkitResetPassword>(res, "Password reset failed");
}

/**
 * Reads what an action code would do without spending it: `accounts:resetPassword`
 * with no new password only inspects the code, as the client SDK's `checkActionCode`.
 */
export async function identityCheckOobCode(
    oobCode: string
): Promise<ToolkitCheckOob> {
    const key = getWebApiKey();
    const res = await fetch(`${base()}/accounts:resetPassword?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode }),
    });
    return parseToolkitJson<ToolkitCheckOob>(res, "Action code check failed");
}

/** Applies an email-verification or email-change action code. */
export async function identityApplyOobCode(
    oobCode: string
): Promise<ToolkitApplyOob> {
    const key = getWebApiKey();
    const res = await fetch(`${base()}/accounts:update?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode }),
    });
    return parseToolkitJson<ToolkitApplyOob>(res, "Email verification failed");
}

export type ToolkitProviderUserInfo = {
    providerId: string;
    rawId?: string;
    screenName?: string;
    displayName?: string;
    photoUrl?: string;
};

type ToolkitLookup = {
    users?: Array<{ providerUserInfo?: ToolkitProviderUserInfo[] }>;
};

/**
 * Reads the provider data Firebase stored for the account behind `idToken`. The ID token
 * itself authorizes the lookup, so no service credential and no provider token is needed.
 */
export async function identityLookupProvider(
    idToken: string,
    providerId: string
): Promise<ToolkitProviderUserInfo | null> {
    const key = getWebApiKey();
    const res = await fetch(`${base()}/accounts:lookup?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
    });
    const data = await parseToolkitJson<ToolkitLookup>(
        res,
        "Account lookup failed"
    );
    return (
        data.users?.[0]?.providerUserInfo?.find(
            (info) => info.providerId === providerId
        ) ?? null
    );
}
