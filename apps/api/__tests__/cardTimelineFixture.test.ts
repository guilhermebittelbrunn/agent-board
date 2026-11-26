import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    attachArtifactInputSchema,
    postUpdateInputSchema,
    questionSchema,
} from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import { cardEventMapper } from "@/(shared)/mappers/card-event.mapper";
import { buildTimelineDocuments } from "../scripts/cardTimelineFixture.mjs";

const scriptsDir = join(__dirname, "../scripts");
const fixture = JSON.parse(
    readFileSync(join(scriptsDir, "fixtures/card-timeline.json"), "utf8")
);
const NOW = new Date("2026-11-26T12:00:00.000Z");
const built = buildTimelineDocuments(fixture, {
    boardId: "agent-board-demo--sample-app",
    slug: "search-cards",
    now: NOW,
});

describe("card timeline fixture", () => {
    it("maps every document without losing a field the type uses", () => {
        for (const { id, document } of built.events) {
            const event = cardEventMapper.toDTO({ id, ...document });

            expect(event.type).toBe(document.type);
            expect(event.author).toEqual(document.author);
            expect(event.stageKey).toBe(document.stageKey);
            if ("markdown" in event) {
                expect(event.markdown).toBe(document.markdown);
            }
            if (event.type === "artifact") {
                expect(event.artifact).toEqual(document.artifact);
            }
            if (event.type === "report") {
                expect(event.outcome).toBe(document.outcome);
            }
        }
    });

    it("only holds what an agent could send through the contract", () => {
        for (const { document } of built.events) {
            const ref = { cardId: document.cardId, stage: document.stageKey };
            if (document.type === "question") {
                for (const question of document.questions) {
                    expect(questionSchema.safeParse(question).success).toBe(
                        true
                    );
                }
            }
            if (document.type === "artifact") {
                expect(
                    attachArtifactInputSchema.safeParse({
                        ...ref,
                        ...document.artifact,
                    }).success
                ).toBe(true);
            }
            if (document.type === "update") {
                expect(
                    postUpdateInputSchema.safeParse({
                        ...ref,
                        markdown: document.markdown,
                    }).success
                ).toBe(true);
            }
        }
    });

    it("opens the pending ask on the fixture's question", () => {
        expect(built.pendingAsk).toEqual({
            eventId: "fixture_agent-board-demo--sample-app__search-cards_04",
            stageKey: "analyze",
            count: 2,
        });
        expect(
            built.events.find(
                (event: { document: { type: string } }) =>
                    event.document.type === "artifact"
            )?.document.artifact?.path
        ).toBe("docs/features/search-cards/analyze/plan.md");
    });
});

const envOf = (vars: Record<string, string>) =>
    vars as unknown as NodeJS.ProcessEnv;

describe("seed-card-timeline.mjs", () => {
    // Only the variables under test: nothing from the developer's shell reaches the script.
    const run = (env: Record<string, string>) =>
        spawnSync(
            process.execPath,
            [join(scriptsDir, "seed-card-timeline.mjs"), "board", "slug"],
            {
                env: envOf({ PATH: process.env.PATH ?? "", ...env }),
                encoding: "utf8",
            }
        );

    it("refuses to run without both emulators", () => {
        const result = run({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-x" });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Refusing to seed");
    });

    it("refuses a project that is not a demo one, even with the emulators set", () => {
        const result = run({
            FIRESTORE_EMULATOR_HOST: "127.0.0.1:1",
            FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:1",
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: "agent-board-prod",
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
            'the target project is "agent-board-prod"'
        );
    });
});
