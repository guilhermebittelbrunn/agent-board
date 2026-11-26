import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
    resolveSpecHref,
    SpecMarkdown,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/SpecMarkdown";

const LINKS = {
    owner: "agent-board-demo",
    name: "sample-app",
    ref: "main",
    documentPath: "specs/features/search-cards.md",
};

const HTTPS_URL = /^https:\/\//;

const draw = (content: string) =>
    render(<SpecMarkdown content={content} links={LINKS} />);

describe("SpecMarkdown", () => {
    it("shows raw HTML as text instead of running it", () => {
        const { container } = draw(
            '<script>alert("spec")</script>\n\nHello <img src=x onerror=alert(1)> there'
        );

        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent).toContain(
            '<script>alert("spec")</script>'
        );
        expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    });

    it("never turns javascript: or data: into a link", () => {
        const { container } = draw(
            "[click](javascript:alert(1)) and [data](data:text/html;base64,PHNjcmlwdD4=)"
        );

        expect(container.querySelector("a")).toBeNull();
        expect(screen.getByText("click")).toBeTruthy();
        expect(screen.getByText("data")).toBeTruthy();
    });

    it("keeps every link on http(s) for encoded, mixed-case and autolinked schemes", () => {
        const { container } = draw(
            [
                "[a](&#106;avascript:alert(1))",
                "[b](JaVaScRiPt:alert(1))",
                "[c](%6Aavascript:alert(1))",
                "<javascript:alert(1)>",
                "[d](vbscript:msgbox(1))",
            ].join("\n\n")
        );

        for (const anchor of container.querySelectorAll("a")) {
            expect(anchor.getAttribute("href")).toMatch(HTTPS_URL);
        }
    });

    it("points relative links at the file on GitHub, resolved from the spec folder", () => {
        draw(
            "[atalhos](keyboard-shortcuts.md) and [doc](../../docs/x.md#topo)"
        );

        expect(
            screen.getByRole("link", { name: "atalhos" }).getAttribute("href")
        ).toBe(
            "https://github.com/agent-board-demo/sample-app/blob/main/specs/features/keyboard-shortcuts.md"
        );
        expect(
            screen.getByRole("link", { name: "doc" }).getAttribute("href")
        ).toBe(
            "https://github.com/agent-board-demo/sample-app/blob/main/docs/x.md#topo"
        );
    });

    it("opens web links in a new tab without the opener", () => {
        draw("[site](https://docs.github.com/)");
        const link = screen.getByRole("link", { name: "site" });

        expect(link.getAttribute("href")).toBe("https://docs.github.com/");
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("rel")).toBe("noreferrer noopener");
    });

    it("draws an image as a link with its alternative text, never as <img>", () => {
        const { container } = draw("![Esboço da busca](assets/search.png)");

        expect(container.querySelector("img")).toBeNull();
        expect(
            screen
                .getByRole("link", { name: "Imagem: Esboço da busca" })
                .getAttribute("href")
        ).toBe(
            "https://github.com/agent-board-demo/sample-app/blob/main/specs/features/assets/search.png"
        );
    });

    it("renders tables, task lists and code", () => {
        const { container } = draw(
            [
                "| Item | Entra |",
                "|------|-------|",
                "| Busca & filtro | sim |",
                "",
                "- [x] feito",
                "- [ ] pendente",
                "",
                "```ts",
                "const a = b && c < d;",
                "```",
            ].join("\n")
        );

        const table = screen.getByRole("table");
        expect(
            within(table).getByRole("columnheader", { name: "Item" })
        ).toBeTruthy();
        expect(
            within(table).getByRole("cell", { name: "Busca & filtro" })
        ).toBeTruthy();
        const boxes = screen.getAllByRole("checkbox");
        expect(boxes.map((box) => box.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
        ]);
        expect(container.querySelector("pre code")?.textContent).toBe(
            "const a = b && c < d;"
        );
    });

    it("shows & < and quotes in text and inline code as written", () => {
        const { container } = draw('Use `a & b` when x < y and "q" & z');

        expect(container.querySelector("code")?.textContent).toBe("a & b");
        expect(container.textContent).toContain('when x < y and "q" & z');
        expect(container.textContent).not.toContain("&amp;");
    });

    it("keeps the page's h1 unique by starting the spec headings at h2", () => {
        draw("# Title\n\n## Section");

        expect(
            screen.getByRole("heading", { level: 2, name: "Title" })
        ).toBeTruthy();
        expect(
            screen.getByRole("heading", { level: 3, name: "Section" })
        ).toBeTruthy();
        expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    });
});

describe("resolveSpecHref", () => {
    it("refuses paths that leave the repository and protocol-relative URLs", () => {
        expect(resolveSpecHref("../../../outside.md", LINKS)).toBeNull();
        expect(resolveSpecHref("//evil.example/x", LINKS)).toBeNull();
        expect(resolveSpecHref("vbscript:x", LINKS)).toBeNull();
        expect(resolveSpecHref(" JavaScript:alert(1)", LINKS)).toBeNull();
    });

    it("resolves from the repository root when the document path is empty", () => {
        expect(
            resolveSpecHref("docs/a.md", { ...LINKS, documentPath: "" })
        ).toBe(
            "https://github.com/agent-board-demo/sample-app/blob/main/docs/a.md"
        );
    });
});
