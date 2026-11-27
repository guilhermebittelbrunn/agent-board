import { globalTranslations } from "@repo/internationalization/translations/global";
import { describe, expect, it } from "vitest";
import {
    buildAccountPreferencesSchema,
    buildAccountProfileSchema,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/account/(validations)/accountFormSchema";

const dictionary = globalTranslations["pt-br"];
const profileSchema = buildAccountProfileSchema(dictionary);
const preferencesSchema = buildAccountPreferencesSchema();

const profileBase = { displayName: "Ana Souza", phone: "", avatar: "" };

describe("buildAccountProfileSchema", () => {
    it("accepts a filled profile", () => {
        expect(profileSchema.safeParse(profileBase).success).toBe(true);
    });

    it("requires a display name", () => {
        expect(
            profileSchema.safeParse({ ...profileBase, displayName: " " })
                .success
        ).toBe(false);
    });

    it("accepts a plausible phone and refuses letters", () => {
        expect(
            profileSchema.safeParse({
                ...profileBase,
                phone: "+55 (51) 99999-0000",
            }).success
        ).toBe(true);
        expect(
            profileSchema.safeParse({ ...profileBase, phone: "ligue já" })
                .success
        ).toBe(false);
    });

    it("accepts an image reference but refuses a javascript url", () => {
        expect(
            profileSchema.safeParse({
                ...profileBase,
                avatar: "https://cdn.example.com/a.png",
            }).success
        ).toBe(true);
        expect(
            profileSchema.safeParse({
                ...profileBase,
                avatar: "uploads/profile-1/9f1c8e30-4b7a-4c21-9f2a-3c5b0d8e1a44.webp",
            }).success
        ).toBe(true);
        expect(
            profileSchema.safeParse({
                ...profileBase,
                avatar: "javascript:alert(1)",
            }).success
        ).toBe(false);
    });
});

describe("buildAccountPreferencesSchema", () => {
    it("only accepts the supported theme", () => {
        expect(preferencesSchema.safeParse({ theme: "dark" }).success).toBe(
            true
        );
        expect(preferencesSchema.safeParse({ theme: "neon" }).success).toBe(
            false
        );
    });
});
