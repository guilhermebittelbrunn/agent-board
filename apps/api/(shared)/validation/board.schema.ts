import { githubLoginSchema } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { z } from "zod";

const REPOSITORY_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** `owner/name` as GitHub spells it. `.` and `..` match the character set but are never repositories. */
export const repositoryFullNameSchema = z
    .string()
    .trim()
    .refine((value) => {
        const [owner, name, ...rest] = value.split("/");
        return (
            rest.length === 0 &&
            owner !== undefined &&
            name !== undefined &&
            githubLoginSchema.safeParse(owner).success &&
            REPOSITORY_NAME.test(name) &&
            name !== "." &&
            name !== ".."
        );
    });

const createBoardSchema = z.object({ repository: repositoryFullNameSchema });
const boardPreviewQuerySchema = z.object({
    repository: repositoryFullNameSchema,
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type BoardPreviewQuery = z.infer<typeof boardPreviewQuerySchema>;

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const validationFailed = (): { ok: false; response: Response } => ({
    ok: false,
    response: Response.json(
        { error: { code: "VALIDATION_FAILED" } },
        { status: HTTP_STATUS.BAD_REQUEST }
    ),
});

export function parseCreateBoard(body: unknown): Parsed<CreateBoardInput> {
    const parsed = createBoardSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}

export function parseBoardPreviewQuery(
    req: Request
): Parsed<BoardPreviewQuery> {
    const params = new URL(req.url).searchParams;
    const parsed = boardPreviewQuerySchema.safeParse({
        repository: params.get("repository") ?? undefined,
    });
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}
