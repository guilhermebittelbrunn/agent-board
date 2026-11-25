import { describe, expect, it } from "vitest";
import {
    canManageMembers,
    canTriggerStages,
    canViewBoard,
    resolveEffectiveRole,
} from "../src/roles";

describe("resolveEffectiveRole", () => {
    it("keeps the board role when GitHub allows it", () => {
        expect(resolveEffectiveRole("operator", "write")).toBe("operator");
        expect(resolveEffectiveRole("owner", "admin")).toBe("owner");
    });

    it("downgrades to what the repository permission allows", () => {
        expect(resolveEffectiveRole("operator", "read")).toBe("viewer");
        expect(resolveEffectiveRole("owner", "write")).toBe("operator");
        expect(resolveEffectiveRole("maintainer", "triage")).toBe("viewer");
    });

    it("never upgrades beyond the board role", () => {
        expect(resolveEffectiveRole("viewer", "admin")).toBe("viewer");
    });

    it("removes access when the member lost the repository", () => {
        expect(resolveEffectiveRole("owner", "none")).toBeNull();
    });
});

describe("permissions", () => {
    it("lets only operators and above trigger stages", () => {
        expect(canTriggerStages("viewer")).toBe(false);
        expect(canTriggerStages("operator")).toBe(true);
        expect(canTriggerStages(null)).toBe(false);
    });

    it("lets maintainers manage members", () => {
        expect(canManageMembers("operator")).toBe(false);
        expect(canManageMembers("maintainer")).toBe(true);
    });

    it("hides the board from users without an effective role", () => {
        expect(canViewBoard(null)).toBe(false);
        expect(canViewBoard("viewer")).toBe(true);
    });
});
