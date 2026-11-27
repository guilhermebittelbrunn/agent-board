import { describe, expect, it } from "vitest";
import { parseBoardConfig } from "../src/boardConfig";
import type { CardLastRun } from "../src/run";
import {
    canApproveSpec,
    draftStatus,
    findStageConfig,
    type SpecDraftInput,
    specDraftPath,
} from "../src/specAuthoring";

const parsed = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [{ key: "analyze", column: "Análise", command: "/analyze" }],
    specAuthoring: { model: "sonnet", path: "docs/specs/{slug}/spec.md" },
});
if (!parsed.success) {
    throw parsed.error;
}
const config = parsed.data;

const specRun = (overrides: Partial<CardLastRun> = {}): CardLastRun => ({
    id: "r1",
    stageKey: "spec",
    status: "finished",
    outcome: "success",
    endReason: "agent",
    stoppedByLogin: null,
    finishedAt: "2026-11-27T10:00:00.000Z",
    ...overrides,
});

const draft = (overrides: Partial<SpecDraftInput> = {}): SpecDraftInput => ({
    lane: "drafts",
    state: "idle",
    pendingAsk: null,
    activeRunId: null,
    lastRun: specRun(),
    ...overrides,
});

const pendingAsk = { eventId: "e1", stageKey: "spec", count: 2 };

describe("findStageConfig", () => {
    it("returns the spec authoring settings as the spec stage", () => {
        expect(findStageConfig(config, "spec")).toMatchObject({
            key: "spec",
            command: "/spec",
            agent: "estrategista-produto",
            model: "sonnet",
            effort: "high",
            approval: "none",
        });
    });

    it("finds a stage of board.yml and nothing for an unknown key", () => {
        expect(findStageConfig(config, "analyze")?.command).toBe("/analyze");
        expect(findStageConfig(config, "deploy")).toBeUndefined();
    });
});

describe("specDraftPath", () => {
    it("puts the slug in the configured path", () => {
        expect(specDraftPath(config, "audit-log")).toBe(
            "docs/specs/audit-log/spec.md"
        );
    });
});

describe("draftStatus", () => {
    it("is writing while a run is queued or running", () => {
        expect(draftStatus(draft({ activeRunId: "r2", state: "queued" }))).toBe(
            "writing"
        );
        expect(
            draftStatus(draft({ activeRunId: "r2", state: "running" }))
        ).toBe("writing");
    });

    it("is waiting while a question is open", () => {
        expect(
            draftStatus(
                draft({
                    pendingAsk,
                    state: "waiting_input",
                    lastRun: specRun({ outcome: "needs_input" }),
                })
            )
        ).toBe("waiting");
    });

    it("is ready after a successful round", () => {
        expect(draftStatus(draft())).toBe("ready");
    });

    it("is failed after a failed round", () => {
        expect(
            draftStatus(
                draft({
                    state: "failed",
                    lastRun: specRun({ outcome: "failed" }),
                })
            )
        ).toBe("failed");
    });

    it("is failed, never waiting, when a round stopped without a question", () => {
        expect(
            draftStatus(
                draft({
                    state: "waiting_input",
                    lastRun: specRun({ outcome: "needs_rework" }),
                })
            )
        ).toBe("failed");
    });

    it("is idle when it never ran or the run was stopped", () => {
        expect(draftStatus(draft({ lastRun: null }))).toBe("idle");
        expect(
            draftStatus(
                draft({
                    lastRun: specRun({ status: "stopped", outcome: null }),
                })
            )
        ).toBe("idle");
    });
});

describe("canApproveSpec", () => {
    it("approves a draft whose last round succeeded with nothing open", () => {
        expect(canApproveSpec(draft())).toBe(true);
    });

    it("refuses each missing condition", () => {
        expect(canApproveSpec(draft({ lane: "tasks" }))).toBe(false);
        expect(
            canApproveSpec(draft({ activeRunId: "r2", state: "running" }))
        ).toBe(false);
        expect(canApproveSpec(draft({ pendingAsk }))).toBe(false);
        expect(canApproveSpec(draft({ state: "failed" }))).toBe(false);
        expect(canApproveSpec(draft({ lastRun: null }))).toBe(false);
        expect(
            canApproveSpec(draft({ lastRun: specRun({ stageKey: "analyze" }) }))
        ).toBe(false);
        expect(
            canApproveSpec(
                draft({ lastRun: specRun({ outcome: "needs_input" }) })
            )
        ).toBe(false);
    });
});
