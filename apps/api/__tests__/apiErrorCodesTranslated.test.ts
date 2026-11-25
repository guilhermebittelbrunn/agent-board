import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = resolve(__dirname, "..");
const SOURCE_ENTRIES = ["app", "(shared)", "proxy.ts"].map((entry) =>
    join(API_ROOT, entry)
);
const API_ERRORS_FILE = resolve(
    API_ROOT,
    "../../packages/internationalization/translations/packages/shared/utils.ts"
);

// Identity Toolkit messages are matched with `.includes("…")`; they are inputs, not codes we answer.
const ERROR_CODE_LITERAL = /(includes\(\s*)?"([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)"/g;
const TRANSLATED_CODE = /^\s+([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+):/gm;
const SOURCE_FILE = /\.tsx?$/;

function sourceFiles(entry: string): string[] {
    if (statSync(entry).isFile()) {
        return [entry];
    }
    return readdirSync(entry, { recursive: true, encoding: "utf8" })
        .filter((file) => SOURCE_FILE.test(file) && !file.includes(".test."))
        .map((file) => join(entry, file));
}

function emittedCodes(): Map<string, string> {
    const codes = new Map<string, string>();
    for (const file of SOURCE_ENTRIES.flatMap(sourceFiles)) {
        for (const match of readFileSync(file, "utf8").matchAll(
            ERROR_CODE_LITERAL
        )) {
            const [, providerMessage, code] = match;
            if (!(providerMessage || codes.has(code))) {
                codes.set(code, file.slice(API_ROOT.length + 1));
            }
        }
    }
    return codes;
}

function translatedCodes(): Set<string> {
    const source = readFileSync(API_ERRORS_FILE, "utf8");
    return new Set([...source.matchAll(TRANSLATED_CODE)].map(([, c]) => c));
}

describe("API error codes", () => {
    it("finds the codes the routes answer with", () => {
        const codes = emittedCodes();

        expect(codes.get("USERS_NOT_FOUND")).toBeDefined();
        expect(codes.get("AUTH_RATE_LIMITED")).toBe("proxy.ts");
    });

    it("has pt-br copy in apiErrors for every code the API can answer with", () => {
        const translated = translatedCodes();
        const untranslated = [...emittedCodes()]
            .filter(([code]) => !translated.has(code))
            .map(([code, file]) => `${code} (${file})`);

        expect(untranslated).toEqual([]);
    });
});
