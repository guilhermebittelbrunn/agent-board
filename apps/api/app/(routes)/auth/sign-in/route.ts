import { isEmulated } from "@repo/auth/emulator";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    IdentityToolkitError,
    identitySignInWithPassword,
} from "@/(shared)/lib/firebase-identity-toolkit";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import {
    mapPasswordCheckMessageToCode,
    statusForAuthErrorCode,
} from "@/(shared)/lib/toolkit-error-codes";
import { getMergedUserByUid } from "@/(shared)/lib/user-merge";
import { toSessionUser } from "@/(shared)/mappers/user.mapper";
import { parseSignIn } from "@/(shared)/validation/auth.schema";

/** Password accounts exist only for the emulator: seed, E2E suite and local QA. */
export async function POST(req: Request) {
    if (!isEmulated()) {
        return Response.json(
            { error: { code: "AUTH_SIGN_IN_METHOD_DISABLED" } },
            { status: HTTP_STATUS.FORBIDDEN }
        );
    }

    const parsedBody = await parseRequestJson(req);
    if (!parsedBody.ok) {
        return parsedBody.response;
    }

    const parsed = parseSignIn(parsedBody.value);
    if (!parsed.ok) {
        return parsed.response;
    }

    let session: Awaited<ReturnType<typeof identitySignInWithPassword>>;
    try {
        session = await identitySignInWithPassword(
            parsed.value.email,
            parsed.value.password
        );
    } catch (error) {
        if (!(error instanceof IdentityToolkitError)) {
            throw error;
        }
        const code = mapPasswordCheckMessageToCode(
            error.message,
            "AUTH_INVALID_CREDENTIALS"
        );
        return Response.json(
            { error: { code } },
            { status: statusForAuthErrorCode(code) }
        );
    }

    const user = await getMergedUserByUid(session.localId);

    if (!user) {
        return Response.json(
            { error: { code: "USERS_NOT_FOUND" } },
            { status: HTTP_STATUS.NOT_FOUND }
        );
    }

    return Response.json({
        session: {
            idToken: session.idToken,
            refreshToken: session.refreshToken,
            expiresIn: session.expiresIn,
        },
        user: toSessionUser(user),
    });
}
