import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import {
    type RouteIdParamsContext,
    resolveIdFromContext,
} from "@/(shared)/lib/resolve-route-id";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { requireSessionApi } from "@/app/(guards)/session";

/** Revoking stops the runner on its next call; a run it holds stops on its next heartbeat. */
export const DELETE = requireSessionApi<RouteIdParamsContext>(
    async (_req, ctx) => {
        const id = await resolveIdFromContext(ctx);
        const revoked = await runnerRepository.revokeOwned(
            id,
            ctx.profile.id,
            new Date()
        );
        if (!revoked) {
            return Response.json(
                { error: { code: "RUNNER_NOT_FOUND" } },
                { status: HTTP_STATUS.NOT_FOUND }
            );
        }
        logEvent("runner", "revoked", { runnerId: id });
        return new Response(null, { status: 204 });
    }
);
