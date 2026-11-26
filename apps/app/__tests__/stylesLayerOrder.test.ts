import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;

const statementsOf = (css: string) =>
    css
        .replace(CSS_COMMENT, "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);

describe("app stylesheet", () => {
    const statements = statementsOf(
        readFileSync(path.resolve(__dirname, "../app/styles.css"), "utf8")
    );

    it("declares the cascade layer order before importing Tailwind", () => {
        expect(statements[0]).toBe(
            "@layer theme, base, antd, components, utilities"
        );
        expect(statements[1]).toBe('@import "tailwindcss"');
    });
});
