import {
    CARD_LANES,
    CARD_STATES,
    type CardLane,
    type CardLastRun,
    type CardPendingAsk,
    type CardState,
    RUN_END_REASONS,
    RUN_STATUSES,
    type RunEndReason,
    type RunStatus,
    STAGE_OUTCOMES,
    type StageOutcome,
} from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import Mapper from "./Mapper";

export const CARD_TABLE = "card";

export type CardFirestoreRow = Record<string, unknown> & { id: string };

/** The stored card as the API sees it; `CardDTO` is what leaves the API. */
export type CardRecord = CardDTO & { movedByUserId: string | null };

/**
 * Slugs only hold lowercase letters, digits and single hyphens, so `__` splits the board id
 * back out, and two syncs running at once write the same document instead of two cards.
 */
export const cardIdFor = (boardId: string, slug: string): string =>
    `${boardId}__${slug}`;

const PERSISTED_KEYS = [
    "boardId",
    "slug",
    "title",
    "spec",
    "ready",
    "orphan",
    "lane",
    "stageKey",
    "state",
    "reworkLoops",
    "order",
    "branch",
    "activeRunId",
    "lastRun",
    "movedAt",
    "movedByUserId",
    "syncedAt",
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

const instantOrNull = (value: unknown): string | null =>
    value == null ? null : normalizeFirestoreInstant(value);

const asLane = (value: unknown): CardLane =>
    CARD_LANES.includes(value as CardLane) ? (value as CardLane) : "tasks";

const asState = (value: unknown): CardState =>
    CARD_STATES.includes(value as CardState) ? (value as CardState) : "idle";

const asCount = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

function toPendingAsk(value: unknown): CardPendingAsk | null {
    const pending = asRecord(value);
    const eventId = textOrNull(pending.eventId);
    const stageKey = textOrNull(pending.stageKey);
    if (eventId === null || stageKey === null) {
        return null;
    }
    return { eventId, stageKey, count: asCount(pending.count) };
}

function toLastRun(value: unknown): CardLastRun | null {
    const run = asRecord(value);
    const id = textOrNull(run.id);
    const stageKey = textOrNull(run.stageKey);
    const status = run.status as RunStatus;
    if (id === null || stageKey === null || !RUN_STATUSES.includes(status)) {
        return null;
    }
    return {
        id,
        stageKey,
        status,
        outcome: STAGE_OUTCOMES.includes(run.outcome as StageOutcome)
            ? (run.outcome as StageOutcome)
            : null,
        endReason: RUN_END_REASONS.includes(run.endReason as RunEndReason)
            ? (run.endReason as RunEndReason)
            : null,
        stoppedByLogin: textOrNull(run.stoppedByLogin),
        finishedAt: instantOrNull(run.finishedAt),
    };
}

class CardMapper extends Mapper<CardFirestoreRow, CardRecord> {
    toDTO(row: CardFirestoreRow): CardRecord {
        const { id, ...record } = row;
        const spec = asRecord(record.spec);
        const stageKey = textOrNull(record.stageKey);
        // A stage card without its stage key would sit in no column, so it falls back to Tasks.
        const lane =
            asLane(record.lane) === "stage" && stageKey === null
                ? "tasks"
                : asLane(record.lane);

        return {
            id,
            boardId: String(record.boardId ?? ""),
            slug: String(record.slug ?? ""),
            title: String(record.title ?? record.slug ?? ""),
            spec: {
                path: String(spec.path ?? ""),
                sha: String(spec.sha ?? ""),
                status: String(spec.status ?? ""),
            },
            ready: record.ready === true,
            orphan: record.orphan === true,
            lane,
            stageKey: lane === "stage" ? stageKey : null,
            state: asState(record.state),
            pendingAsk: toPendingAsk(record.pendingAsk),
            reworkLoops: asCount(record.reworkLoops),
            order: asCount(record.order),
            branch: textOrNull(record.branch),
            activeRunId: textOrNull(record.activeRunId),
            lastRun: toLastRun(record.lastRun),
            movedAt: instantOrNull(record.movedAt),
            movedByUserId: textOrNull(record.movedByUserId),
            syncedAt: normalizeFirestoreInstant(record.syncedAt),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt: instantOrNull(record.deletedAt),
        };
    }

    toPersistence(
        input: AllOptional<CardRecord> | Record<string, unknown>
    ): AllOptional<Record<string, unknown>> {
        const source = input as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of PERSISTED_KEYS) {
            if (source[key] !== undefined) {
                out[key] = source[key];
            }
        }
        return out as AllOptional<Record<string, unknown>>;
    }
}

export const cardMapper = new CardMapper();

export function toCardDTO(card: CardRecord): CardDTO {
    const { movedByUserId: _movedBy, ...dto } = card;
    return dto;
}
