import type { UserDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { UserRecord } from "firebase-admin/auth";
import type { NextRequest } from "next/server";
import { resolveApiActor } from "@/(shared)/lib/resolve-api-actor";
import { userRepository } from "@/(shared)/repositories/user.repository";

export type SessionAuthContext = {
    user: UserRecord;
    profile: UserDTO;
};

type RouteContext = Record<string, unknown> | undefined;

type SessionHandler<TRouteContext extends RouteContext> = (
    req: NextRequest,
    ctx: SessionAuthContext &
        (TRouteContext extends undefined
            ? Record<string, never>
            : TRouteContext)
) => Promise<Response>;

export function requireSessionApi<
    TRouteContext extends RouteContext = undefined,
>(handler: SessionHandler<TRouteContext>) {
    return async (req: NextRequest, routeContext?: TRouteContext) => {
        const user = await resolveApiActor(req);

        if (!user) {
            return Response.json(
                { error: { code: "AUTH_INVALID_TOKEN" } },
                { status: HTTP_STATUS.UNAUTHORIZED }
            );
        }

        const profile = await userRepository.findByReferenceId(user.uid);

        if (!profile) {
            return Response.json(
                { error: { code: "AUTH_PROFILE_NOT_FOUND" } },
                { status: HTTP_STATUS.FORBIDDEN }
            );
        }

        const enrichedContext = {
            ...(routeContext ?? {}),
            user,
            profile,
        } as SessionAuthContext &
            (TRouteContext extends undefined
                ? Record<string, never>
                : TRouteContext);

        return handler(req, enrichedContext);
    };
}
