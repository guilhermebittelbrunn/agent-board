import {
    ATTACHMENTS_PER_DRAFT,
    DRAFT_REQUEST_MAX,
} from "@repo/kanban-contract";
import type { CreateSpecDraftRequest } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { z } from "zod";

const MAX_PATH = 200;
const MAX_NAME = 200;

const createSpecDraftSchema = z.object({
    text: z.string().trim().min(1).max(DRAFT_REQUEST_MAX),
    attachments: z
        .array(
            z.object({
                path: z.string().min(1).max(MAX_PATH),
                name: z.string().trim().min(1).max(MAX_NAME),
            })
        )
        .max(ATTACHMENTS_PER_DRAFT)
        .default([]),
});

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

export function parseCreateSpecDraft(
    body: unknown
): Parsed<CreateSpecDraftRequest> {
    const parsed = createSpecDraftSchema.safeParse(body);
    if (parsed.success) {
        return { ok: true, value: parsed.data };
    }
    return {
        ok: false,
        response: Response.json(
            { error: { code: "VALIDATION_FAILED" } },
            { status: HTTP_STATUS.BAD_REQUEST }
        ),
    };
}
