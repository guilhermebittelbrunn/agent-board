import {
    type BoardConfig,
    SLUG_PLACEHOLDER,
    SPEC_STAGE_KEY,
    type StageConfig,
} from "./boardConfig";
import type { CardLane } from "./boardLanes";
import type { CardPendingAsk } from "./cardEvent";
import type { CardState } from "./cardState";
import type { CardLastRun } from "./run";

export const SPEC_DRAFT_COLUMN = "Rascunhos";

export const ATTACHMENT_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/markdown",
] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

const BYTES_PER_KIB = 1024;
// The agent reads an attachment base64-encoded inside a JSON response; 3 MiB grows to 4 MiB,
// which stays under the ~4.5 MB response cap of a serverless function.
const ATTACHMENT_MAX_MIB = 3;
export const ATTACHMENT_MAX_BYTES =
    ATTACHMENT_MAX_MIB * BYTES_PER_KIB * BYTES_PER_KIB;
export const ATTACHMENTS_PER_DRAFT = 5;
export const DRAFT_REQUEST_MAX = 10_000;

export const isAttachmentType = (value: string): value is AttachmentType =>
    (ATTACHMENT_TYPES as readonly string[]).includes(value);

/** The spec authoring settings of `board.yml` seen as a stage, so runs and events treat it like one. */
export function specAuthoringStage(config: BoardConfig): StageConfig {
    const settings = config.specAuthoring;
    return {
        key: SPEC_STAGE_KEY,
        column: SPEC_DRAFT_COLUMN,
        command: settings.command,
        agent: settings.agent,
        model: settings.model,
        effort: settings.effort,
        runners: settings.runners,
        approval: "none",
    };
}

export function findStageConfig(
    config: BoardConfig,
    key: string
): StageConfig | undefined {
    if (key === SPEC_STAGE_KEY) {
        return specAuthoringStage(config);
    }
    return config.stages.find((stage) => stage.key === key);
}

export function specDraftPath(config: BoardConfig, slug: string): string {
    return config.specAuthoring.path.replaceAll(SLUG_PLACEHOLDER, slug);
}

export type SpecDraftStatus =
    | "writing"
    | "waiting"
    | "ready"
    | "failed"
    | "idle";

export type SpecDraftInput = {
    lane: CardLane;
    state: CardState;
    pendingAsk: CardPendingAsk | null;
    activeRunId: string | null;
    lastRun: CardLastRun | null;
};

function lastSpecRunSucceeded(card: SpecDraftInput): boolean {
    return (
        card.lastRun?.stageKey === SPEC_STAGE_KEY &&
        card.lastRun.status === "finished" &&
        card.lastRun.outcome === "success"
    );
}

export function draftStatus(card: SpecDraftInput): SpecDraftStatus {
    if (
        card.activeRunId !== null ||
        card.state === "queued" ||
        card.state === "running"
    ) {
        return "writing";
    }
    if (card.pendingAsk !== null) {
        return "waiting";
    }
    // A round that asked for input without leaving a question has nothing to answer:
    // only running it again moves the draft, as after a failure.
    if (card.state === "failed" || card.state === "waiting_input") {
        return "failed";
    }
    return lastSpecRunSucceeded(card) ? "ready" : "idle";
}

/** A draft is approved only after a successful writing round with nothing left to answer. */
export function canApproveSpec(card: SpecDraftInput): boolean {
    return (
        card.lane === "drafts" &&
        card.activeRunId === null &&
        card.pendingAsk === null &&
        card.state === "idle" &&
        lastSpecRunSucceeded(card)
    );
}
