import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    firstHeading,
    parseSpecFrontmatter,
    specBody,
} from "../src/specFrontmatter";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function repositorySpecFiles(): string[] {
    const backlog = readdirSync(`${REPO_ROOT}specs/features`)
        .filter((name) => name.endsWith(".md"))
        .map((name) => `specs/features/${name}`);
    const archived = readdirSync(`${REPO_ROOT}docs/features`)
        .map((slug) => `docs/features/${slug}/spec.md`)
        .filter((file) => existsSync(`${REPO_ROOT}${file}`));
    return [...backlog, ...archived, "specs/reference/TEMPLATE.md"];
}

describe("parseSpecFrontmatter on this repository", () => {
    it.each(repositorySpecFiles())("reads %s", (file) => {
        const text = readFileSync(`${REPO_ROOT}${file}`, "utf8");

        expect(parseSpecFrontmatter(text)).toMatchObject({ ok: true });
    });
});

describe("parseSpecFrontmatter", () => {
    it("reads id, title and status", () => {
        const text =
            "---\nid: search-cards\ntitle: Busca por texto\nstatus: approved\narea: [apps/app]\n---\n\n# Busca\n";

        expect(parseSpecFrontmatter(text)).toEqual({
            ok: true,
            spec: {
                id: "search-cards",
                title: "Busca por texto",
                status: "approved",
            },
        });
    });

    it("returns null for a file without frontmatter", () => {
        expect(parseSpecFrontmatter("# Specs\n\nSome text.\n")).toBeNull();
        expect(parseSpecFrontmatter("")).toBeNull();
    });

    it("refuses a block without id or status", () => {
        expect(parseSpecFrontmatter("---\nid: x\n---\n")).toEqual({
            ok: false,
        });
        expect(parseSpecFrontmatter("---\nstatus: approved\n---\n")).toEqual({
            ok: false,
        });
    });

    it("keeps title null when the block has none", () => {
        expect(
            parseSpecFrontmatter("---\nid: x\nstatus: proposed\n---\n# T\n")
        ).toEqual({
            ok: true,
            spec: { id: "x", title: null, status: "proposed" },
        });
    });

    it("refuses broken YAML, duplicated keys and a non-mapping block", () => {
        for (const text of [
            "---\nid: [x\n---\n",
            "---\nid: a\nid: b\nstatus: approved\n---\n",
            "---\n- id: a\n---\n",
        ]) {
            expect(parseSpecFrontmatter(text)).toEqual({ ok: false });
        }
    });

    it("refuses custom tags instead of running them", () => {
        expect(
            parseSpecFrontmatter(
                "---\nid: !!js/function 'function () {}'\nstatus: approved\n---\n"
            )
        ).toEqual({ ok: false });
    });

    it("refuses a block whose aliases expand into a huge object", () => {
        const lines = ["---", "a: &a [x, x, x, x, x, x, x, x, x, x]"];
        let previous = "a";
        for (const name of ["b", "c", "d", "e", "f", "g", "h"]) {
            lines.push(
                `${name}: &${name} [*${previous}, *${previous}, *${previous}, *${previous}, *${previous}, *${previous}, *${previous}, *${previous}, *${previous}, *${previous}]`
            );
            previous = name;
        }
        lines.push("id: x", "status: approved", "---");

        expect(parseSpecFrontmatter(lines.join("\n"))).toEqual({ ok: false });
    });

    it("accepts Windows line endings", () => {
        expect(
            parseSpecFrontmatter("---\r\nid: x\r\nstatus: approved\r\n---\r\n")
        ).toMatchObject({ ok: true, spec: { id: "x", status: "approved" } });
    });
});

describe("firstHeading", () => {
    it("reads the first level-one heading after the frontmatter", () => {
        expect(
            firstHeading("---\nid: x\nstatus: a\n---\n\n## Not this\n# Busca\n")
        ).toBe("Busca");
    });

    it("returns null when there is none", () => {
        expect(firstHeading("plain text")).toBeNull();
    });
});

describe("specBody", () => {
    it("drops the frontmatter block and keeps the markdown after it", () => {
        expect(
            specBody("---\nid: x\nstatus: a\n---\n\n# Busca\n\nTexto\n")
        ).toBe("\n\n# Busca\n\nTexto\n");
    });

    it("keeps a file without frontmatter as it is", () => {
        expect(specBody("# Busca\n\n---\n\nTexto")).toBe(
            "# Busca\n\n---\n\nTexto"
        );
    });
});
