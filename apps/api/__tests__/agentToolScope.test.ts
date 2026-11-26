import { describe, expect, it } from "vitest";
import { checkToolScope } from "@/(shared)/lib/agent-contract/agent-scope";

const RUN = { boardId: "b1", cardId: "b1__search-cards", stageKey: "analyze" };

describe("checkToolScope", () => {
    it("lets a token reach its own card and stage", () => {
        expect(
            checkToolScope(
                "post_update",
                { cardId: "b1__search-cards", stage: "analyze" },
                RUN
            )
        ).toBeNull();
        expect(
            checkToolScope("get_card", { cardId: "b1__search-cards" }, RUN)
        ).toBeNull();
    });

    it("refuses another card, even on the same board and stage", () => {
        expect(
            checkToolScope(
                "complete_stage",
                { cardId: "b1__other-card", stage: "analyze" },
                RUN
            )
        ).toBe("AGENT_CARD_MISMATCH");
        expect(
            checkToolScope("get_card", { cardId: "b1__other-card" }, RUN)
        ).toBe("AGENT_CARD_MISMATCH");
    });

    it("refuses another stage of the same card", () => {
        expect(
            checkToolScope(
                "ask",
                { cardId: "b1__search-cards", stage: "develop" },
                RUN
            )
        ).toBe("AGENT_STAGE_MISMATCH");
    });

    it("checks the board of create_card", () => {
        expect(
            checkToolScope("create_card", { boardId: "b1" }, RUN)
        ).toBeNull();
        expect(checkToolScope("create_card", { boardId: "b2" }, RUN)).toBe(
            "AGENT_CARD_MISMATCH"
        );
    });
});
