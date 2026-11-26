import type { RunnerRegisterResult } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { hashRunnerCode } from "@/(shared)/lib/runner/runner-code";
import { mintRunnerToken } from "@/(shared)/lib/runner/runner-token";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { parseRunnerRegister } from "@/(shared)/validation/runner.schema";

/**
 * No guard: the one-time code is the credential. The runner token is returned here once and
 * only its hash is kept.
 */
export async function POST(req: Request): Promise<Response> {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseRunnerRegister(body.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const registered = await runnerRepository.registerWithCode({
        codeHash: hashRunnerCode(parsed.value.code),
        name: parsed.value.name,
        mint: mintRunnerToken,
        now: new Date(),
    });
    if (!registered.ok) {
        return Response.json(
            { error: { code: "RUNNER_CODE_INVALID" } },
            { status: HTTP_STATUS.BAD_REQUEST }
        );
    }
    logEvent("runner", "registered", { runnerId: registered.runner.id });
    const data: RunnerRegisterResult = {
        runnerId: registered.runner.id,
        name: registered.runner.name,
        token: registered.token,
    };
    return Response.json({ data }, { status: HTTP_STATUS.CREATED });
}
