import { getIdTokenSession } from "@repo/auth/server";
import type { GithubIdentity } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { IdentityToolkitError } from "@/(shared)/lib/firebase-identity-toolkit";
import {
    readGithubIdentity,
    signedInWithGithub,
} from "@/(shared)/lib/github-identity";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import {
    getMergedUserByUid,
    syncGithubIdentity,
} from "@/(shared)/lib/user-merge";
import { toSessionUser } from "@/(shared)/mappers/user.mapper";
import { parseGithubSignIn } from "@/(shared)/validation/auth.schema";

function errorResponse(code: string, status: number): Response {
    return Response.json({ error: { code } }, { status });
}

async function readIdentityOrNull(
    idToken: string,
    claims: Parameters<typeof readGithubIdentity>[1]
): Promise<GithubIdentity | null> {
    try {
        return await readGithubIdentity(idToken, claims);
    } catch (error) {
        if (!(error instanceof IdentityToolkitError)) {
            throw error;
        }
        return null;
    }
}

/**
 * Receives the Firebase ID token of a GitHub popup sign-in. The GitHub access token never
 * reaches the API: the identity is read back from Firebase with the ID token itself.
 */
export async function POST(req: Request) {
    const parsedBody = await parseRequestJson(req);
    if (!parsedBody.ok) {
        return parsedBody.response;
    }

    const parsed = parseGithubSignIn(parsedBody.value);
    if (!parsed.ok) {
        return parsed.response;
    }

    const { idToken } = parsed.value;
    const session = await getIdTokenSession(idToken);
    if (!session) {
        return errorResponse("AUTH_INVALID_TOKEN", HTTP_STATUS.UNAUTHORIZED);
    }
    if (!signedInWithGithub(session.decoded)) {
        return errorResponse(
            "AUTH_SIGN_IN_METHOD_DISABLED",
            HTTP_STATUS.FORBIDDEN
        );
    }

    const identity = await readIdentityOrNull(idToken, session.decoded);
    if (!identity) {
        logEvent("auth", "github-identity-unavailable", {});
        return errorResponse(
            "AUTH_GITHUB_PROFILE_UNAVAILABLE",
            HTTP_STATUS.BAD_GATEWAY
        );
    }

    const user = await getMergedUserByUid(session.user.uid);
    if (!user) {
        return errorResponse("USERS_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }

    await syncGithubIdentity(String(user.id), user.github, identity);
    return Response.json({ user: toSessionUser(user) });
}
