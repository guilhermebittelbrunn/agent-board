import { isValidSlug } from "@repo/kanban-contract";
import type { MoveCardRequest, ReorderCardsRequest } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { z } from "zod";

const MAX_REORDER_SLUGS = 500;

const slugSchema = z.string().refine(isValidSlug);

const moveCardSchema = z.discriminatedUnion("lane", [
    z.object({ lane: z.literal("tasks") }),
    z.object({ lane: z.literal("done") }),
]);

const reorderCardsSchema = z.object({
    slugs: z
        .array(slugSchema)
        .min(1)
        .max(MAX_REORDER_SLUGS)
        .refine((slugs) => new Set(slugs).size === slugs.length),
});

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const validationFailed = (): { ok: false; response: Response } => ({
    ok: false,
    response: Response.json(
        { error: { code: "VALIDATION_FAILED" } },
        { status: HTTP_STATUS.BAD_REQUEST }
    ),
});

export function parseMoveCard(body: unknown): Parsed<MoveCardRequest> {
    const parsed = moveCardSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}

export function parseReorderCards(body: unknown): Parsed<ReorderCardsRequest> {
    const parsed = reorderCardsSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}
