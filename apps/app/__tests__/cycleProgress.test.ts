import type { CardDTO, CycleDTO } from "@repo/sdk/src/types";
import { describe, expect, it } from "vitest";
import { activityHeadline } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CycleActivity";
import { toggleSlug } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CycleSpecPicker";
import { isCycleCandidate } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/cycleCandidates";
import {
    cycleCounters,
    splitElapsed,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/cycleCounters";
import { cycleProgress } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/cycleProgress";
import { runCard } from "./runCardFixtures";

const ONE_HOUR_TWELVE_AND_A_HALF_MS = 4_350_000;

const STAGES = [
    { key: "analyze" },
    { key: "develop" },
    { key: "pr", pullRequest: { draft: true } },
];

const item = (slug: string, status: CycleDTO["items"][number]["status"]) => ({
    slug,
    title: slug,
    status,
    code: null,
    startedAt: null,
    endedAt: null,
});

const cycle = (items: CycleDTO["items"]) => ({ items });

const card = (slug: string, overrides: Partial<CardDTO>): CardDTO =>
    runCard(slug, { lane: "tasks", stageKey: null, ...overrides });

describe("cycleProgress", () => {
    it("marks stages before the current one done and after it pending", () => {
        const [row] = cycleProgress(
            cycle([item("a", "running")]),
            [
                card("a", {
                    lane: "stage",
                    stageKey: "develop",
                    state: "running",
                    reworkLoops: 1,
                }),
            ],
            STAGES
        );

        expect(row?.cells).toEqual([
            { kind: "done" },
            { kind: "current", state: "running", reworkLoops: 1 },
            { kind: "pending" },
        ]);
    });

    it("shows the pull request number on the pull request stage", () => {
        const [row] = cycleProgress(
            cycle([item("a", "done")]),
            [
                card("a", {
                    lane: "stage",
                    stageKey: "pr",
                    state: "idle",
                    pullRequest: {
                        number: 14,
                        draft: true,
                    } as CardDTO["pullRequest"],
                }),
            ],
            STAGES
        );

        expect(row?.cells[2]).toEqual({
            kind: "pullRequest",
            number: 14,
            draft: true,
        });
    });

    it("leaves a spec still in Tasks or with no card all pending, in the cycle's order", () => {
        const rows = cycleProgress(
            cycle([item("b", "pending"), item("gone", "skipped")]),
            [card("b", {})],
            STAGES
        );

        expect(rows.map((row) => [row.position, row.slug])).toEqual([
            [1, "b"],
            [2, "gone"],
        ]);
        for (const row of rows) {
            expect(row.cells.every((cell) => cell.kind === "pending")).toBe(
                true
            );
        }
    });
});

describe("cycleCounters", () => {
    it("counts open pull requests, decisions to review and the time so far", () => {
        const counters = cycleCounters(
            {
                items: [item("a", "done"), item("b", "running")],
                startedAt: "2026-11-27T21:00:00.000Z",
                finishedAt: null,
            },
            [
                { pullRequest: { state: "open" } as CardDTO["pullRequest"] },
                { pullRequest: null },
            ],
            [{ product: true }, { product: false }],
            new Date("2026-11-27T22:12:30.000Z")
        );

        expect(counters).toEqual({
            pullRequests: 1,
            done: 1,
            decisions: 2,
            review: 1,
            elapsedMs: ONE_HOUR_TWELVE_AND_A_HALF_MS,
        });
        expect(splitElapsed(ONE_HOUR_TWELVE_AND_A_HALF_MS)).toEqual({
            hours: 1,
            minutes: 12,
        });
    });

    it("has no elapsed time while queued", () => {
        expect(
            cycleCounters(
                { items: [], startedAt: null, finishedAt: null },
                [],
                [],
                new Date()
            ).elapsedMs
        ).toBeNull();
    });
});

describe("new cycle picking", () => {
    it("appends a spec and takes it out keeping the order of the others", () => {
        expect(toggleSlug(["a", "b"], "c")).toEqual(["a", "b", "c"]);
        expect(toggleSlug(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    });

    it("offers only ready specs in Tasks that run nothing and are in no cycle", () => {
        expect(isCycleCandidate(card("a", {}))).toBe(true);
        expect(isCycleCandidate(card("a", { cycleId: "c1" }))).toBe(false);
        expect(isCycleCandidate(card("a", { activeRunId: "r1" }))).toBe(false);
        expect(isCycleCandidate(card("a", { ready: false }))).toBe(false);
        expect(
            isCycleCandidate(card("a", { lane: "stage", stageKey: "develop" }))
        ).toBe(false);
    });

    it("shows the first line of an activity as plain text", () => {
        expect(activityHeadline("\n### Análise — plano pronto\nresto")).toBe(
            "Análise — plano pronto"
        );
    });
});
