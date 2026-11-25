import type { AccountDTO } from "@repo/sdk/src/types";
import { describe, expect, it } from "vitest";
import {
    hasSignInMethod,
    lacksPasswordProvider,
    PASSWORD_PROVIDER_ID,
} from "@/shared/lib/signInMethods";

const GOOGLE_PROVIDER_ID = "google.com";

function accountWith(...providerIds: string[]): AccountDTO {
    return {
        providerData: providerIds.map((providerId) => ({
            providerId,
            uid: `${providerId}-uid`,
            displayName: null,
            email: "owner@example.com",
            phoneNumber: null,
        })),
    } as unknown as AccountDTO;
}

describe("hasSignInMethod", () => {
    it("answers true while the account is still loading", () => {
        expect(hasSignInMethod(undefined, PASSWORD_PROVIDER_ID)).toBe(true);
        expect(hasSignInMethod(undefined, GOOGLE_PROVIDER_ID)).toBe(true);
    });

    it("finds only the providers the account lists", () => {
        const googleOnly = accountWith(GOOGLE_PROVIDER_ID);

        expect(hasSignInMethod(googleOnly, GOOGLE_PROVIDER_ID)).toBe(true);
        expect(hasSignInMethod(googleOnly, PASSWORD_PROVIDER_ID)).toBe(false);
    });

    it("answers false for an account with no provider at all", () => {
        expect(hasSignInMethod(accountWith(), PASSWORD_PROVIDER_ID)).toBe(
            false
        );
    });
});

describe("lacksPasswordProvider", () => {
    it.each([
        ["loading", undefined, false],
        ["Google only", accountWith(GOOGLE_PROVIDER_ID), true],
        ["password only", accountWith(PASSWORD_PROVIDER_ID), false],
        [
            "password and Google",
            accountWith(PASSWORD_PROVIDER_ID, GOOGLE_PROVIDER_ID),
            false,
        ],
    ])("%s → %s", (_label, account, expected) => {
        expect(lacksPasswordProvider(account)).toBe(expected);
    });
});
