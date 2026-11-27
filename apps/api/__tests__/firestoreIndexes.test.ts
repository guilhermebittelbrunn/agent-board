import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type IndexField = {
    fieldPath: string;
    order?: string;
    arrayConfig?: string;
};
type CompositeIndex = {
    collectionGroup: string;
    queryScope: string;
    fields: IndexField[];
};

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

const { indexes } = JSON.parse(
    readFileSync(join(REPO_ROOT, "firestore.indexes.json"), "utf8")
) as { indexes: CompositeIndex[] };

/**
 * The emulator serves any query, indexed or not, so nothing else in the suite notices a
 * missing declaration — it only surfaces against a real project, as a refused query.
 */
describe("firestore.indexes.json", () => {
    it("declares the index the profile lookup depends on", () => {
        expect(indexes).toContainEqual({
            collectionGroup: "user",
            queryScope: "COLLECTION",
            fields: [
                { fieldPath: "reference_id", order: "ASCENDING" },
                { fieldPath: "deletedAt", order: "ASCENDING" },
            ],
        });
    });

    it("declares no index for a collection the API no longer reads", () => {
        const collections = new Set(
            indexes.map((index) => index.collectionGroup)
        );

        expect(collections.has("entity")).toBe(false);
        expect(collections.has("notification")).toBe(false);
    });
});
