import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
    cycleItemsDocument,
    cycleMapper,
    toCycleDTO,
} from "@/(shared)/mappers/cycle.mapper";

const AT = "2026-11-27T22:00:00.000Z";

describe("cycleMapper", () => {
    it("turns timestamps into ISO, at the top and on each item", () => {
        const cycle = cycleMapper.toDTO({
            id: "c1",
            boardId: "b1",
            status: "running",
            endReason: null,
            options: { until: "testing", concurrency: 2, onFailure: "stop" },
            items: [
                {
                    slug: "alpha",
                    cardId: "b1__alpha",
                    title: "Alpha",
                    status: "running",
                    code: null,
                    startedAt: Timestamp.fromDate(new Date(AT)),
                    endedAt: null,
                },
            ],
            startedBy: { userId: "u1", login: "octo" },
            stoppedBy: null,
            startedAt: Timestamp.fromDate(new Date(AT)),
            finishedAt: null,
            createdAt: Timestamp.fromDate(new Date(AT)),
            updatedAt: Timestamp.fromDate(new Date(AT)),
            deletedAt: null,
        });

        expect(cycle).toMatchObject({
            status: "running",
            options: { until: "testing", concurrency: 2, onFailure: "stop" },
            startedAt: AT,
            createdAt: AT,
            items: [{ slug: "alpha", status: "running", startedAt: AT }],
        });
    });

    it("fills what an item or the options lack, and drops an item without slug", () => {
        const cycle = cycleMapper.toDTO({
            id: "c1",
            boardId: "b1",
            status: "bogus",
            options: {},
            items: [{ slug: "alpha" }, { title: "no slug" }],
        });

        expect(cycle.status).toBe("finished");
        expect(cycle.options).toEqual({
            until: "pull_request",
            concurrency: 1,
            onFailure: "skip",
        });
        expect(cycle.items).toEqual([
            {
                slug: "alpha",
                cardId: "",
                title: "alpha",
                status: "pending",
                code: null,
                startedAt: null,
                endedAt: null,
            },
        ]);
        expect(cycle.startedBy).toEqual({ userId: "", login: "" });
    });

    it("persists only the known fields", () => {
        expect(
            cycleMapper.toPersistence({
                status: "running",
                secret: "x",
            } as Record<string, unknown>)
        ).toEqual({ status: "running" });
    });

    it("stores item instants as dates", () => {
        expect(
            cycleItemsDocument([
                {
                    slug: "a",
                    cardId: "b1__a",
                    title: "A",
                    status: "done",
                    code: null,
                    startedAt: AT,
                    endedAt: null,
                },
            ])[0]?.startedAt
        ).toEqual(new Date(AT));
    });

    it("shows who started the cycle by login only, without card ids", () => {
        const dto = toCycleDTO(
            cycleMapper.toDTO({
                id: "c1",
                boardId: "b1",
                status: "stopped",
                items: [{ slug: "alpha", cardId: "b1__alpha" }],
                startedBy: { userId: "u1", login: "octo" },
                stoppedBy: { userId: "u2", login: "hubot" },
            })
        );

        expect(dto.startedByLogin).toBe("octo");
        expect(dto.stoppedByLogin).toBe("hubot");
        expect(dto).not.toHaveProperty("startedBy");
        expect(dto.items[0]).not.toHaveProperty("cardId");
    });
});
