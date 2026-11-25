import { getAuthInstance, revokeUserSessions } from "@repo/auth/server";
import { type UserDTO, UserType } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { requestIdFrom } from "@repo/shared/utils/helpers/request-id";
import { revokeAccountAccess } from "@/(shared)/lib/account-access";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import {
    type RouteIdParamsContext,
    resolveIdFromContext,
} from "@/(shared)/lib/resolve-route-id";
import { adminAuthErrorReason } from "@/(shared)/lib/toolkit-error-codes";
import {
    getMergedUserByFirestoreDocId,
    getMergedUserByUid,
} from "@/(shared)/lib/user-merge";
import { userRepository } from "@/(shared)/repositories/user.repository";
import {
    type AdminUpdateUserInput,
    parseAdminUpdateUserInput,
} from "@/(shared)/validation/user-admin.schema";
import { type AdminAuthContext, requireAdminApi } from "@/app/(guards)/admin";

/**
 * Matched by uid, not by profile id: the disabled flag and the sessions belong to the
 * Firebase Auth account, and more than one profile can point at it.
 */
function isOwnAccount(profile: UserDTO, ctx: AdminAuthContext): boolean {
    return profile.reference_id === ctx.user.uid;
}

function locksOutOfPanel(patch: AdminUpdateUserInput): boolean {
    return (
        patch.disabled === true ||
        (patch.type !== undefined && patch.type !== UserType.ADMIN)
    );
}

function selfLockoutRefusal(): Response {
    return Response.json(
        { error: { code: "USERS_SELF_LOCKOUT_FORBIDDEN" } },
        { status: HTTP_STATUS.FORBIDDEN }
    );
}

export const GET = requireAdminApi<RouteIdParamsContext>(async (_req, ctx) => {
    const id = await resolveIdFromContext(ctx);

    let merged = await getMergedUserByFirestoreDocId(id);
    if (!merged) {
        merged = await getMergedUserByUid(id);
    }

    if (!merged) {
        return Response.json(
            { error: { code: "USERS_NOT_FOUND" } },
            { status: 404 }
        );
    }

    return Response.json({ data: merged });
});

export const PUT = requireAdminApi<RouteIdParamsContext>(async (req, ctx) => {
    const id = await resolveIdFromContext(ctx);
    const profile = await userRepository.findById(id);

    if (!profile) {
        return Response.json(
            { error: { code: "USERS_NOT_FOUND" } },
            { status: 404 }
        );
    }

    const parsedBody = await parseRequestJson(req);
    if (!parsedBody.ok) {
        return parsedBody.response;
    }

    const parsed = parseAdminUpdateUserInput(parsedBody.value);
    if (!parsed.ok) {
        return parsed.response;
    }

    if (isOwnAccount(profile, ctx) && locksOutOfPanel(parsed.value)) {
        return selfLockoutRefusal();
    }

    if (parsed.value.type !== undefined) {
        await userRepository.update({ id, type: parsed.value.type });
    }

    // displayName + disabled both live in Firebase Auth — update them in one call.
    const authUpdate: { displayName?: string; disabled?: boolean } = {};
    if (parsed.value.displayName !== undefined) {
        authUpdate.displayName = parsed.value.displayName || undefined;
    }
    if (parsed.value.disabled !== undefined) {
        authUpdate.disabled = parsed.value.disabled;
    }
    if (Object.keys(authUpdate).length > 0) {
        await getAuthInstance().updateUser(profile.reference_id, authUpdate);
    }

    if (parsed.value.disabled === true) {
        await revokeUserSessions(profile.reference_id);
    }

    const merged = await getMergedUserByFirestoreDocId(id);

    return Response.json({ data: merged });
});

export const DELETE = requireAdminApi<RouteIdParamsContext>(
    async (req, ctx) => {
        const id = await resolveIdFromContext(ctx);
        const profile = await userRepository.findById(id);

        if (!profile) {
            return Response.json(
                { error: { code: "USERS_NOT_FOUND" } },
                { status: 404 }
            );
        }

        if (isOwnAccount(profile, ctx)) {
            return selfLockoutRefusal();
        }

        try {
            await revokeAccountAccess(profile.reference_id);
        } catch (error) {
            logEvent("auth", "admin-user-delete-auth-failed", {
                requestId: requestIdFrom(req),
                reason: adminAuthErrorReason(error),
            });
            return Response.json(
                { error: { code: "USERS_DELETE_AUTH_FAILED" } },
                { status: HTTP_STATUS.SERVICE_UNAVAILABLE }
            );
        }

        await userRepository.delete(id);

        return new Response(null, { status: 204 });
    }
);
