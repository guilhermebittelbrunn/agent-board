import { shortRunnerId as boardShortRunnerId } from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import { shortRunnerId } from "../src/config.ts";

describe("shortRunnerId", () => {
    it.each(["c704GbOe9oebXk2LmN", "abc", "", "aaaaaa11", "_-xY9z0"])(
        "matches the id the board shows for %j",
        (runnerId) => {
            expect(shortRunnerId(runnerId)).toBe(boardShortRunnerId(runnerId));
        }
    );
});
