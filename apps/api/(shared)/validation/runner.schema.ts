import {
    type RunnerFinishInput,
    type RunnerHeartbeatInput,
    type RunnerRegisterInput,
    runnerFinishSchema,
    runnerHeartbeatSchema,
    runnerRegisterSchema,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { z } from "zod";

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

function parseWith<T>(schema: z.ZodType<T>, body: unknown): Parsed<T> {
    const parsed = schema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : {
              ok: false,
              response: Response.json(
                  { error: { code: "VALIDATION_FAILED" } },
                  { status: HTTP_STATUS.BAD_REQUEST }
              ),
          };
}

export const parseRunnerRegister = (
    body: unknown
): Parsed<RunnerRegisterInput> => parseWith(runnerRegisterSchema, body);

export const parseRunnerHeartbeat = (
    body: unknown
): Parsed<RunnerHeartbeatInput> => parseWith(runnerHeartbeatSchema, body);

export const parseRunnerFinish = (body: unknown): Parsed<RunnerFinishInput> =>
    parseWith(runnerFinishSchema, body);
