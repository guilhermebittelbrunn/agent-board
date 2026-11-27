import { formatRunnerCode, RUNNER_CODE_TTL_MS } from "@repo/kanban-contract";
import type { RunnerRegistrationDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    hashRunnerCode,
    mintRunnerCode,
} from "@/(shared)/lib/runner/runner-code";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { requireSessionApi } from "@/app/(guards)/session";

/** A one-time code that registers a runner for the signed-in person within ten minutes. */
export const POST = requireSessionApi(async (_req, ctx) => {
    const now = new Date();
    const code = mintRunnerCode();
    const expiresAt = new Date(now.getTime() + RUNNER_CODE_TTL_MS);
    await runnerRepository.createRegistration({
        userId: ctx.profile.id,
        codeHash: hashRunnerCode(code),
        expiresAt,
        now,
    });
    const data: RunnerRegistrationDTO = {
        code: formatRunnerCode(code),
        expiresAt: expiresAt.toISOString(),
    };
    return Response.json({ data }, { status: HTTP_STATUS.CREATED });
});
