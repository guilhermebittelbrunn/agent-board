import { describe, expect, it } from "vitest";
import { latestArtifacts } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/latestArtifacts";
import { artifactAt, updateAt } from "./cardEventFixtures";

const SHA_A = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const SHA_B = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d";

describe("latestArtifacts", () => {
    it("keeps one entry per path, the most recent winning, newest first", () => {
        const artifacts = latestArtifacts([
            artifactAt("p1", 0, "docs/plan.md", SHA_A),
            artifactAt("h1", 1, "docs/handoff.md", SHA_A),
            artifactAt("p2", 2, "docs/plan.md", SHA_B),
        ]);

        expect(
            artifacts.map((event) => [event.id, event.artifact.commitSha])
        ).toEqual([
            ["p2", SHA_B],
            ["h1", SHA_A],
        ]);
    });

    it("ignores the other event types", () => {
        expect(latestArtifacts([updateAt("u1", 1, "analyze")])).toEqual([]);
    });
});
