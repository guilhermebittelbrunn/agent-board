import { describe, expect, it } from "vitest";
import { isSafeJob } from "../src/job.ts";
import { jobFixture } from "./fixtures.ts";

const repository = (owner: string, name: string) => ({
    repository: { owner, name, baseBranch: "main" },
});

describe("isSafeJob", () => {
    it("refuses . and .. as the repository owner or name", () => {
        for (const [owner, name] of [
            ["..", ".."],
            ["..", "sample-app"],
            ["agent-board-demo", ".."],
            [".", "sample-app"],
            ["agent-board-demo", "."],
        ]) {
            expect(isSafeJob(jobFixture(repository(owner, name)))).toBe(false);
        }
    });

    it("accepts names that only start with a dot", () => {
        expect(isSafeJob(jobFixture(repository("octo", ".github")))).toBe(true);
    });
});
