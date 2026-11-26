import { RUNNER_SEEN_WRITE_INTERVAL_MS } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { matchesRunToken } from "@/(shared)/lib/agent-contract/run-token";
import { readBearer } from "@/(shared)/lib/agent-contract/run-token-format";
import type { RunnerRecord } from "@/(shared)/mappers/runner.mapper";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { parseRunnerToken } from "./runner-token-format";

export type RunnerContext = { runner: RunnerRecord; now: Date };

type TokenRefusal = "RUNNER_TOKEN_INVALID" | "RUNNER_REVOKED";

const refuseToken = (code: TokenRefusal): Response =>
    Response.json(
        { error: { code } },
        {
            status: HTTP_STATUS.UNAUTHORIZED,
            headers: { "WWW-Authenticate": "Bearer" },
        }
    );

/**
 * Runner routes are called by a machine, not by a person: no cookie and no session, so
 * impersonation never applies. The runner token proves which runner calls; a missing runner
 * and a wrong secret get the same answer. Only a token whose secret matches can learn that
 * its runner was revoked.
 */
export function requireRunnerApi<TParams = Record<string, never>>(
    handler: (
        req: NextRequest,
        ctx: RunnerContext & { params: TParams }
    ) => Promise<Response>
) {
    return async (
        req: NextRequest,
        route: { params: TParams | Promise<TParams> }
    ): Promise<Response> => {
        const parsed = parseRunnerToken(
            readBearer(req.headers.get("authorization"))
        );
        if (parsed === null) {
            return refuseToken("RUNNER_TOKEN_INVALID");
        }
        const stored = await runnerRepository.findWithToken(parsed.runnerId);
        if (
            stored === null ||
            !matchesRunToken(parsed.secret, stored.tokenHash)
        ) {
            return refuseToken("RUNNER_TOKEN_INVALID");
        }
        if (stored.runner.deletedAt !== null) {
            return refuseToken("RUNNER_REVOKED");
        }
        const now = new Date();
        if (
            now.getTime() - Date.parse(stored.runner.lastSeenAt) >=
            RUNNER_SEEN_WRITE_INTERVAL_MS
        ) {
            await runnerRepository.touch(stored.runner.id, now);
        }
        return handler(req, {
            runner: stored.runner,
            now,
            params: await route.params,
        });
    };
}
