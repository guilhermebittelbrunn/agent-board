import { describe, expect, it } from "vitest";
import { githubFileUrl } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/githubFileUrl";

describe("githubFileUrl", () => {
    it("points to the file on the default branch", () => {
        expect(
            githubFileUrl(
                "agent-board-demo",
                "sample-app",
                "main",
                ".kanban/board.yml"
            )
        ).toBe(
            "https://github.com/agent-board-demo/sample-app/blob/main/.kanban/board.yml"
        );
    });

    it("keeps the slash of a branch name such as release/v1", () => {
        expect(
            githubFileUrl("acme", "web", "release/v1", ".kanban/board.yml")
        ).toBe("https://github.com/acme/web/blob/release/v1/.kanban/board.yml");
    });

    it("encodes characters that would break the path inside each segment", () => {
        expect(
            githubFileUrl("acme", "web", "feat/a b#1", "dir/my file?.yml")
        ).toBe(
            "https://github.com/acme/web/blob/feat/a%20b%231/dir/my%20file%3F.yml"
        );
    });

    it("does not let the owner or the name add path segments", () => {
        expect(githubFileUrl("a/b", "c/d", "main", "x.yml")).toBe(
            "https://github.com/a%2Fb/c%2Fd/blob/main/x.yml"
        );
    });
});
