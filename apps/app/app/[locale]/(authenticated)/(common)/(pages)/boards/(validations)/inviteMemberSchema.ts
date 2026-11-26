import type { globalTranslations } from "@repo/internationalization/translations/global";
import {
    githubLoginSchema,
    INVITABLE_BOARD_ROLES,
    type InvitableBoardRole,
} from "@repo/kanban-contract";
import { z } from "zod";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

export type InviteMemberFormValues = {
    login: string;
    role: InvitableBoardRole;
};

export type ChangeMemberRoleFormValues = { role: InvitableBoardRole };

export function buildInviteMemberSchema(dictionary: Dictionary) {
    const inviteCopy = dictionary.apps.app.pages.common.boards.members.invite;

    return z.object({
        login: z
            .string()
            .trim()
            .refine((value) => githubLoginSchema.safeParse(value).success, {
                message: inviteCopy.loginInvalid,
            }),
        role: z.enum(INVITABLE_BOARD_ROLES),
    });
}

export function buildChangeMemberRoleSchema() {
    return z.object({ role: z.enum(INVITABLE_BOARD_ROLES) });
}
