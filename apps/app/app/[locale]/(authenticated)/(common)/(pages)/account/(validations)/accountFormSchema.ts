import type { globalTranslations } from "@repo/internationalization/translations/global";
import { z } from "zod";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

const DISPLAY_NAME_MAX = 120;
const PHONE_MAX = 32;
const AVATAR_REFERENCE_MAX = 2048;
const PHONE_RE = /^[\d\s()+-]+$/;
const STORAGE_OBJECT_PATH_RE =
    /^uploads\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * The field holds a reference, not a picture: either an object already uploaded to the
 * bucket or an absolute http(s) URL. Pinning the scheme is what keeps `javascript:` out,
 * since it parses as a URL and the value reaches the `src` of a rendered image.
 */
function isAvatarReference(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed === "" || STORAGE_OBJECT_PATH_RE.test(trimmed)) {
        return true;
    }
    try {
        const url = new URL(trimmed);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

export type AccountProfileFormValues = {
    displayName: string;
    phone: string;
    avatar: string;
};

export const accountThemeValues = ["light", "dark", "system"] as const;

export type AccountPreferencesFormValues = {
    theme: (typeof accountThemeValues)[number];
};

export function buildAccountProfileSchema(dictionary: Dictionary) {
    const validation =
        dictionary.apps.app.pages.common.account.profile.validation;

    return z.object({
        displayName: z
            .string()
            .trim()
            .min(1, validation.displayNameRequired)
            .max(DISPLAY_NAME_MAX, validation.displayNameMax),
        phone: z
            .string()
            .max(PHONE_MAX, validation.phoneInvalid)
            .refine(
                (value) => value.trim() === "" || PHONE_RE.test(value.trim()),
                validation.phoneInvalid
            ),
        avatar: z
            .string()
            .max(AVATAR_REFERENCE_MAX, validation.avatarReference)
            .refine(isAvatarReference, {
                message: validation.avatarReference,
            }),
    });
}

export function buildAccountPreferencesSchema() {
    return z.object({
        theme: z.enum(accountThemeValues),
    });
}
