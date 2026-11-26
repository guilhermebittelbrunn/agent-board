import { describe, expect, it } from "vitest";
import { extractBacklogLinks, resolveRepoPath } from "../src/specBacklog";

const INDEX = "specs/BACKLOG.md";

describe("extractBacklogLinks", () => {
    it("resolves links from the folder of the index, in first-appearance order", () => {
        const markdown = [
            "| # | spec |",
            "|---|------|",
            "| 1 | [`b`](features/b.md) |",
            "| 2 | [`a`](./features/a.md) |",
            "See [the doc](../docs/board/README.md) and [b again](features/b.md).",
        ].join("\n");

        expect(extractBacklogLinks(markdown, INDEX)).toEqual([
            "specs/features/b.md",
            "specs/features/a.md",
            "docs/board/README.md",
        ]);
    });

    it("drops anchors, external links and non-markdown files", () => {
        const markdown = [
            "[a](features/a.md#riscos)",
            "[site](https://example.com/x.md)",
            "[mail](mailto:someone@example.com)",
            "[js](javascript:alert(1).md)",
            "[section](#ordem)",
            "[image](assets/board.png)",
        ].join("\n");

        expect(extractBacklogLinks(markdown, INDEX)).toEqual([
            "specs/features/a.md",
        ]);
    });

    it("drops paths that leave the repository root and the index itself", () => {
        const markdown =
            "[up](../../outside.md) [self](BACKLOG.md) [root](/docs/x.md)";

        expect(extractBacklogLinks(markdown, INDEX)).toEqual(["docs/x.md"]);
    });

    it("decodes percent-encoded paths and accepts a link title", () => {
        expect(
            extractBacklogLinks('[a](features/my%20spec.md "title")', INDEX)
        ).toEqual(["specs/features/my spec.md"]);
    });

    it("reads an index at the repository root", () => {
        expect(extractBacklogLinks("[a](specs/a.md)", "BACKLOG.md")).toEqual([
            "specs/a.md",
        ]);
    });
});

describe("resolveRepoPath", () => {
    it("refuses to climb above the root", () => {
        expect(resolveRepoPath("specs", "../../x.md")).toBeNull();
        expect(resolveRepoPath("specs", "../x.md")).toBe("x.md");
    });
});
