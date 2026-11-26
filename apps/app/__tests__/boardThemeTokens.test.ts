import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const boardsDir = join(
    __dirname,
    "../app/[locale]/(authenticated)/(common)/(pages)/boards"
);

const TAILWIND_PALETTE =
    "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILITY_PREFIX =
    "bg|text|border|ring|ring-offset|fill|stroke|from|via|to|outline|divide|shadow|decoration|accent|caret|placeholder";
const FIXED_COLOR = new RegExp(
    [
        "#[0-9a-fA-F]{3,8}\\b",
        "\\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\\(",
        `\\b(?:${COLOR_UTILITY_PREFIX})(?:-[xytrbl])?-(?:${TAILWIND_PALETTE})(?:-\\d{2,3})?\\b`,
    ].join("|"),
    "g"
);
const SOURCE_FILE = /\.tsx?$/;

const findFixedColors = (source: string) => source.match(FIXED_COLOR) ?? [];

const sourceFiles = readdirSync(boardsDir, {
    recursive: true,
    encoding: "utf8",
}).filter((file) => SOURCE_FILE.test(file));

describe("board screens only use design-system color tokens", () => {
    it("finds the board sources", () => {
        expect(sourceFiles.length).toBeGreaterThan(0);
    });

    it.each([
        'className="bg-white"',
        'className="text-gray-500"',
        'className="border-red-200"',
        'className="border-t-slate-300"',
        'className="ring-offset-white"',
        'className="bg-[#1a2b3c]"',
        'style={{ color: "rgb(0 0 0)" }}',
        'style={{ color: "oklch(0.5 0.1 200)" }}',
    ])("flags %s as a fixed color", (sample) => {
        expect(findFixedColors(sample)).not.toEqual([]);
    });

    it.each([
        'className="bg-background text-foreground"',
        'className="border-border text-muted-foreground"',
        'className="bg-destructive/10 text-destructive"',
        'className="ring-ring bg-sidebar-border"',
    ])("accepts the token classes in %s", (sample) => {
        expect(findFixedColors(sample)).toEqual([]);
    });

    it.each(sourceFiles)("%s has no fixed color", (file) => {
        const source = readFileSync(join(boardsDir, file), "utf8");
        expect(findFixedColors(source)).toEqual([]);
    });
});
