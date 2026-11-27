import { globalTranslations } from "@repo/internationalization/translations/global";
import {
    EXISTING_PASSWORD_MIN_LENGTH,
    PASSWORD_MIN_LENGTH,
} from "@repo/shared/utils/helpers/passwordPolicy";
import { describe, expect, it } from "vitest";

const LOCALES = ["pt-br"] as const;

type Locale = (typeof LOCALES)[number];

/**
 * The number is written into the copy instead of interpolated, so nothing but this test
 * notices when the constant moves and a message keeps announcing the old minimum.
 */
function newPasswordMessages(locale: Locale): Record<string, string> {
    const { packages } = globalTranslations[locale];
    return {
        "apiErrors.AUTH_PASSWORD_TOO_SHORT":
            packages.utils.apiErrors.AUTH_PASSWORD_TOO_SHORT,
    };
}

function existingPasswordMessages(locale: Locale): Record<string, string> {
    const { apps } = globalTranslations[locale];
    return {
        "app signIn.passwordMin": apps.app.pages.signIn.validation.passwordMin,
    };
}

describe.each(LOCALES)("password length copy in %s", (locale) => {
    it.each(Object.entries(newPasswordMessages(locale)))(
        "%s announces the new-password minimum",
        (_key, message) => {
            expect(message).toContain(String(PASSWORD_MIN_LENGTH));
        }
    );

    it.each(Object.entries(existingPasswordMessages(locale)))(
        "%s announces the existing-password minimum",
        (_key, message) => {
            expect(message).toContain(String(EXISTING_PASSWORD_MIN_LENGTH));
            expect(message).not.toContain(String(PASSWORD_MIN_LENGTH));
        }
    );
});
