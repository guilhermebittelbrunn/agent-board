import {
    type ScheduledTaskInput,
    scheduledTaskInputSchema,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const refused = (code: string, status: number) => ({
    ok: false as const,
    response: Response.json({ error: { code } }, { status }),
});

/** A fire URL outside the documented format gets its own code, so the form can point at the field. */
export function parseSaveScheduledTask(
    body: unknown
): Parsed<ScheduledTaskInput> {
    const parsed = scheduledTaskInputSchema.safeParse(body);
    if (parsed.success) {
        return { ok: true, value: parsed.data };
    }
    const fireUrlRefused = parsed.error.issues.some(
        (issue) => issue.path[0] === "fireUrl" && issue.code !== "invalid_type"
    );
    return fireUrlRefused
        ? refused(
              "CREDENTIAL_FIRE_URL_INVALID",
              HTTP_STATUS.UNPROCESSABLE_ENTITY
          )
        : refused("VALIDATION_FAILED", HTTP_STATUS.BAD_REQUEST);
}
