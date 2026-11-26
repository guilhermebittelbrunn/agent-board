import { describe, expect, it } from "vitest";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";

const FIVE_MINUTES = 300_000;

describe("githubPermissionCache", () => {
    it("keeps an entry for five minutes", () => {
        let now = 0;
        const cache = createGithubPermissionCache(() => now);
        cache.set("owner/repo", "octocat", "write");

        now = FIVE_MINUTES - 1;
        expect(cache.get("owner/repo", "octocat")).toBe("write");

        now = FIVE_MINUTES;
        expect(cache.get("owner/repo", "octocat")).toBeUndefined();
    });

    it("ignores case in repository and user names", () => {
        const cache = createGithubPermissionCache(() => 0);
        cache.set("Owner/Repo", "OctoCat", "admin");

        expect(cache.get("owner/repo", "octocat")).toBe("admin");
    });

    it("invalidates only the entries of one repository, whatever the case", () => {
        const cache = createGithubPermissionCache(() => 0);
        cache.set("owner/repo", "a", "write");
        cache.set("owner/repo", "b", "read");
        cache.set("owner/repo-two", "a", "admin");
        cache.set("owner/rep", "a", "maintain");

        cache.invalidateRepository("OWNER/REPO");

        expect(cache.get("owner/repo", "a")).toBeUndefined();
        expect(cache.get("owner/repo", "b")).toBeUndefined();
        expect(cache.get("owner/repo-two", "a")).toBe("admin");
        expect(cache.get("owner/rep", "a")).toBe("maintain");
    });
});
