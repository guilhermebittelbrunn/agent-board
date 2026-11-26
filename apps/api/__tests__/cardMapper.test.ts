import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
    cardIdFor,
    cardMapper,
    toCardDTO,
} from "@/(shared)/mappers/card.mapper";

const AT = "2026-11-26T10:00:00.000Z";

describe("cardMapper", () => {
    it("turns Firestore timestamps into ISO strings", () => {
        const card = cardMapper.toDTO({
            id: cardIdFor("b", "search-cards"),
            boardId: "b",
            slug: "search-cards",
            title: "Busca",
            spec: {
                path: "specs/features/search-cards.md",
                sha: "abc",
                status: "approved",
            },
            ready: true,
            orphan: false,
            lane: "stage",
            stageKey: "analyze",
            state: "idle",
            reworkLoops: 0,
            order: 2,
            branch: "feat/search-cards",
            movedAt: Timestamp.fromDate(new Date(AT)),
            movedByUserId: "p1",
            syncedAt: Timestamp.fromDate(new Date(AT)),
            createdAt: Timestamp.fromDate(new Date(AT)),
            updatedAt: Timestamp.fromDate(new Date(AT)),
            deletedAt: null,
        });

        expect(card).toMatchObject({
            id: "b__search-cards",
            lane: "stage",
            stageKey: "analyze",
            movedAt: AT,
            syncedAt: AT,
            createdAt: AT,
            deletedAt: null,
        });
    });

    it("fills defaults for a document missing optional fields", () => {
        const card = cardMapper.toDTO({ id: "b__x", boardId: "b", slug: "x" });

        expect(card).toMatchObject({
            title: "x",
            ready: false,
            orphan: false,
            lane: "tasks",
            stageKey: null,
            state: "idle",
            reworkLoops: 0,
            order: 0,
            branch: null,
            activeRunId: null,
            lastRun: null,
            movedAt: null,
            movedByUserId: null,
        });
    });

    it("reads the live run and the last run, dropping an incomplete one", () => {
        const card = cardMapper.toDTO({
            id: "b__x",
            lane: "stage",
            stageKey: "develop",
            activeRunId: "r2",
            lastRun: {
                id: "r1",
                stageKey: "analyze",
                status: "stopped",
                outcome: null,
                endReason: "stopped",
                stoppedByLogin: "octo",
                finishedAt: Timestamp.fromDate(new Date(AT)),
            },
        });

        expect(card).toMatchObject({
            activeRunId: "r2",
            lastRun: {
                id: "r1",
                stageKey: "analyze",
                status: "stopped",
                outcome: null,
                endReason: "stopped",
                stoppedByLogin: "octo",
                finishedAt: AT,
            },
        });
        expect(
            cardMapper.toDTO({ id: "b__x", lastRun: { id: "r1" } }).lastRun
        ).toBeNull();
        expect(
            cardMapper.toDTO({
                id: "b__x",
                lastRun: { id: "r1", stageKey: "analyze", status: "exploded" },
            }).lastRun
        ).toBeNull();
    });

    it("keeps lane and stage key together", () => {
        expect(
            cardMapper.toDTO({ id: "b__x", lane: "stage", stageKey: null })
        ).toMatchObject({ lane: "tasks", stageKey: null });
        expect(
            cardMapper.toDTO({ id: "b__x", lane: "done", stageKey: "analyze" })
        ).toMatchObject({ lane: "done", stageKey: null });
    });

    it("does not send who moved the card out of the API", () => {
        const card = cardMapper.toDTO({ id: "b__x", movedByUserId: "p1" });

        expect(toCardDTO(card)).not.toHaveProperty("movedByUserId");
    });
});
