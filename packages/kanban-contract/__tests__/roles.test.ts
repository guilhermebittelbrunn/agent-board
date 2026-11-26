import { describe, expect, it } from "vitest";
import {
    canAnswerQuestions,
    canChangeMember,
    canCommentOnCards,
    canGrantRole,
    canManageMembers,
    canPrioritizeCards,
    canTriggerStages,
    canViewBoard,
    grantableRoles,
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
    it("lets operators and above answer questions, and every member comment", () => {
        expect(canAnswerQuestions("viewer")).toBe(false);
        expect(canAnswerQuestions("operator")).toBe(true);
        expect(canAnswerQuestions("owner")).toBe(true);
        expect(canAnswerQuestions(null)).toBe(false);
        expect(canCommentOnCards("viewer")).toBe(true);
        expect(canCommentOnCards("owner")).toBe(true);
        expect(canCommentOnCards(null)).toBe(false);
    });

    it("lets only operators and above prioritize cards", () => {
        expect(canPrioritizeCards("viewer")).toBe(false);
        expect(canPrioritizeCards("operator")).toBe(true);
        expect(canPrioritizeCards("owner")).toBe(true);
        expect(canPrioritizeCards(null)).toBe(false);
    });

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

describe("member rules", () => {
    it("grants only invitable roles up to the actor's own", () => {
        expect(grantableRoles("owner")).toEqual([
            "viewer",
            "operator",
            "maintainer",
        ]);
        expect(grantableRoles("maintainer")).toEqual([
            "viewer",
            "operator",
            "maintainer",
        ]);
        expect(grantableRoles("operator")).toEqual([]);
        expect(grantableRoles("viewer")).toEqual([]);
        expect(grantableRoles(null)).toEqual([]);
    });

    it("never grants owner", () => {
        expect(canGrantRole("owner", "owner")).toBe(false);
        expect(canGrantRole("maintainer", "owner")).toBe(false);
    });

    it("refuses roles above the actor", () => {
        expect(canGrantRole("maintainer", "maintainer")).toBe(true);
        expect(canGrantRole("operator", "viewer")).toBe(false);
        expect(canGrantRole(null, "viewer")).toBe(false);
    });

    it("keeps the owner and the actor's own row untouchable", () => {
        const owner = { id: "o", role: "owner" as const };
        expect(canChangeMember(owner, { id: "o", role: "owner" })).toBe(false);
        expect(canChangeMember({ id: "m", role: "maintainer" }, owner)).toBe(
            false
        );
        expect(
            canChangeMember(
                { id: "m", role: "maintainer" },
                { id: "m", role: "maintainer" }
            )
        ).toBe(false);
    });

    it("lets managers change members up to their own role", () => {
        expect(
            canChangeMember(
                { id: "o", role: "owner" },
                { id: "x", role: "maintainer" }
            )
        ).toBe(true);
        expect(
            canChangeMember(
                { id: "m", role: "maintainer" },
                { id: "x", role: "maintainer" }
            )
        ).toBe(true);
        expect(
            canChangeMember(
                { id: "m", role: "maintainer" },
                { id: "x", role: "viewer" }
            )
        ).toBe(true);
    });

    it("refuses actors that cannot manage members", () => {
        expect(
            canChangeMember(
                { id: "p", role: "operator" },
                { id: "x", role: "viewer" }
            )
        ).toBe(false);
        expect(
            canChangeMember(
                { id: "p", role: null },
                { id: "x", role: "viewer" }
            )
        ).toBe(false);
    });
});
