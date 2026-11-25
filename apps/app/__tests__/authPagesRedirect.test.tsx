import { globalTranslations } from "@repo/internationalization/translations/global";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/seo/metadata", () => ({
    createMetadata: (value: unknown) => value,
}));

vi.mock(
    "@/app/[locale]/(unauthenticated)/sign-in/components/SignInForm",
    () => ({
        SignInForm: () => null,
    })
);

const { default: SignIn, generateMetadata } = await import(
    "@/app/[locale]/(unauthenticated)/sign-in/page"
);
const { SignInForm } = await import(
    "@/app/[locale]/(unauthenticated)/sign-in/components/SignInForm"
);

describe("sign-in page", () => {
    it("renders the form, which reads the redirect from the URL itself", () => {
        const element = SignIn() as unknown as { type: unknown };

        expect(element.type).toBe(SignInForm);
    });

    it("reads the metadata from the app namespace", async () => {
        const metadata = await generateMetadata({
            params: Promise.resolve({ locale: "pt-br" }),
        });

        expect(metadata).toBe(
            globalTranslations["pt-br"].apps.app.pages.signIn.meta
        );
    });
});
