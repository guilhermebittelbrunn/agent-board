import { describe, expect, it } from "vitest";
import {
    createInterruptHandler,
    DUPLICATE_SIGNAL_MS,
} from "../src/interrupt.ts";

const PRESSED_AT = 1000;
const FORWARDED_AT = PRESSED_AT + 1;
const PRESSED_AGAIN_AT = PRESSED_AT + DUPLICATE_SIGNAL_MS + PRESSED_AT;

function setup() {
    let clock = 0;
    const seen: string[] = [];
    const handle = createInterruptHandler({
        onFirst: () => seen.push("first"),
        onForce: () => seen.push("force"),
        now: () => clock,
    });
    return {
        seen,
        press: (at: number) => {
            clock = at;
            handle();
        },
    };
}

describe("createInterruptHandler", () => {
    it("treats the copy pnpm forwards right after the terminal's Ctrl+C as the same press", () => {
        const { seen, press } = setup();
        press(PRESSED_AT);
        press(FORWARDED_AT);
        expect(seen).toEqual(["first"]);
    });

    it("leaves at once on a Ctrl+C pressed again later", () => {
        const { seen, press } = setup();
        press(PRESSED_AT);
        press(FORWARDED_AT);
        press(PRESSED_AGAIN_AT);
        expect(seen).toEqual(["first", "force"]);
    });
});
