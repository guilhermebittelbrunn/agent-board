import { globalTranslations } from "@repo/internationalization/translations/global";
import { EXISTING_PASSWORD_MIN_LENGTH } from "@repo/shared/utils/helpers/passwordPolicy";
import { describe, expect, it } from "vitest";
import { buildSignInSchema } from "@/app/[locale]/(unauthenticated)/sign-in/validations/signInSchema";

const EXISTING_AT_MINIMUM = "b".repeat(EXISTING_PASSWORD_MIN_LENGTH);
const EMAIL = "qa-password-policy@example.com";

describe("forms that check a password someone already has", () => {
    const dictionary = globalTranslations["pt-br"];

    it("sign-in still accepts a password created under the old rule", () => {
        expect(
            buildSignInSchema(dictionary).safeParse({
                email: EMAIL,
                password: EXISTING_AT_MINIMUM,
            }).success
        ).toBe(true);
    });

    it("no form accepts a password shorter than Firebase ever allowed", () => {
        const tooShort = "b".repeat(EXISTING_PASSWORD_MIN_LENGTH - 1);

        expect(
            buildSignInSchema(dictionary).safeParse({
                email: EMAIL,
                password: tooShort,
            }).success
        ).toBe(false);
    });
});
