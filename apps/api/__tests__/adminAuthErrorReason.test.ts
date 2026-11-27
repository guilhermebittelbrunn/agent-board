import { describe, expect, it } from "vitest";
import { adminAuthErrorReason } from "@/(shared)/lib/toolkit-error-codes";

function withCode(code: unknown) {
    return Object.assign(new Error("admin sdk"), { code });
}

describe("adminAuthErrorReason", () => {
    it.each([
        [
            "the provider code",
            withCode("auth/internal-error"),
            "auth/internal-error",
        ],
        [
            "the error name when there is no code",
            new TypeError("x@y.z"),
            "TypeError",
        ],
        ["unknown for a thrown string", "x@y.z", "unknown"],
        ["unknown for null", null, "unknown"],
    ])("logs %s", (_label, error, reason) => {
        expect(adminAuthErrorReason(error)).toBe(reason);
    });
});
