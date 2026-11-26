import {
    githubLoginSchema,
    INVITABLE_BOARD_ROLES,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { z } from "zod";

const invitableRoleSchema = z.enum(INVITABLE_BOARD_ROLES);

const inviteBoardMemberSchema = z.object({
    login: z.string().trim().pipe(githubLoginSchema),
    role: invitableRoleSchema,
});
const updateBoardMemberSchema = z.object({ role: invitableRoleSchema });

export type InviteBoardMemberInput = z.infer<typeof inviteBoardMemberSchema>;
export type UpdateBoardMemberInput = z.infer<typeof updateBoardMemberSchema>;

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const validationFailed = (): { ok: false; response: Response } => ({
    ok: false,
    response: Response.json(
        { error: { code: "VALIDATION_FAILED" } },
        { status: HTTP_STATUS.BAD_REQUEST }
    ),
});

export function parseInviteBoardMember(
    body: unknown
): Parsed<InviteBoardMemberInput> {
    const parsed = inviteBoardMemberSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}

export function parseUpdateBoardMember(
    body: unknown
): Parsed<UpdateBoardMemberInput> {
    const parsed = updateBoardMemberSchema.safeParse(body);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : validationFailed();
}
