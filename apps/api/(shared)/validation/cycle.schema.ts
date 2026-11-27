import {
    type CreateCycleInput,
    createCycleInputSchema,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

export function parseCreateCycle(body: unknown): Parsed<CreateCycleInput> {
    const parsed = createCycleInputSchema.safeParse(body);
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
