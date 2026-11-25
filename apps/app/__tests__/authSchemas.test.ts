import { globalTranslations } from "@repo/internationalization/translations/global";
import { describe, expect, it } from "vitest";
import { buildSignInSchema } from "@/app/[locale]/(unauthenticated)/sign-in/validations/signInSchema";

const dictionary = globalTranslations["pt-br"];

describe("buildSignInSchema", () => {
    const schema = buildSignInSchema(dictionary);

    it("accepts valid credentials", () => {
        expect(
            schema.safeParse({
                email: "user@example.com",
                password: "secret1",
            }).success
        ).toBe(true);
    });

    it("rejects an invalid email", () => {
        expect(
            schema.safeParse({ email: "nope", password: "secret1" }).success
        ).toBe(false);
    });

    it("rejects a short password", () => {
        expect(
            schema.safeParse({ email: "user@example.com", password: "123" })
                .success
        ).toBe(false);
    });
});
