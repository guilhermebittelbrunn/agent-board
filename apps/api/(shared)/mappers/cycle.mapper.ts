import {
    CYCLE_END_REASONS,
    CYCLE_ITEM_STATUSES,
    CYCLE_ON_FAILURE,
    CYCLE_STATUSES,
    CYCLE_UNTIL,
    type CycleEndReason,
    type CycleItemState,
    type CycleItemStatus,
    type CycleOnFailure,
    type CycleOptions,
    type CycleStatus,
    type CycleUntil,
    type RunPerson,
} from "@repo/kanban-contract";
import type { CycleDTO } from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import Mapper from "./Mapper";
import { toRunPerson } from "./run.mapper";

export const CYCLE_TABLE = "cycle";

export type CycleFirestoreRow = Record<string, unknown> & { id: string };

export type CycleItemRecord = CycleItemState & {
    cardId: string;
    title: string;
};

/** The stored cycle as the API sees it; `CycleDTO` is what leaves the API. */
export type CycleRecord = {
    id: string;
    boardId: string;
    status: CycleStatus;
    endReason: CycleEndReason | null;
    options: CycleOptions;
    items: CycleItemRecord[];
    startedBy: RunPerson;
    stoppedBy: RunPerson | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

const PERSISTED_KEYS = [
    "boardId",
    "status",
    "endReason",
    "options",
    "items",
    "startedBy",
    "stoppedBy",
    "startedAt",
    "finishedAt",
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

const instantOrNull = (value: unknown): string | null =>
    value == null ? null : normalizeFirestoreInstant(value);

function oneOf<T extends string>(
    values: readonly T[],
    value: unknown,
    fallback: T
): T {
    return values.includes(value as T) ? (value as T) : fallback;
}

function toOptions(value: unknown): CycleOptions {
    const options = asRecord(value);
    return {
        until: oneOf<CycleUntil>(CYCLE_UNTIL, options.until, "pull_request"),
        concurrency: options.concurrency === 2 ? 2 : 1,
        onFailure: oneOf<CycleOnFailure>(
            CYCLE_ON_FAILURE,
            options.onFailure,
            "skip"
        ),
    };
}

function toItem(value: unknown): CycleItemRecord | null {
    const item = asRecord(value);
    const slug = textOrNull(item.slug);
    if (slug === null) {
        return null;
    }
    return {
        slug,
        cardId: String(item.cardId ?? ""),
        title: String(item.title ?? slug),
        status: oneOf<CycleItemStatus>(
            CYCLE_ITEM_STATUSES,
            item.status,
            "pending"
        ),
        code: textOrNull(item.code),
        startedAt: instantOrNull(item.startedAt),
        endedAt: instantOrNull(item.endedAt),
    };
}

const toDate = (iso: string | null): Date | null =>
    iso === null ? null : new Date(iso);

/** The stored shape of the items: every instant as a `Date`, kept as a `Timestamp`. */
export const cycleItemsDocument = (items: CycleItemRecord[]) =>
    items.map((item) => ({
        ...item,
        startedAt: toDate(item.startedAt),
        endedAt: toDate(item.endedAt),
    }));

class CycleMapper extends Mapper<CycleFirestoreRow, CycleRecord> {
    toDTO(row: CycleFirestoreRow): CycleRecord {
        const { id, ...record } = row;
        return {
            id,
            boardId: String(record.boardId ?? ""),
            status: oneOf(CYCLE_STATUSES, record.status, "finished"),
            endReason: CYCLE_END_REASONS.includes(
                record.endReason as CycleEndReason
            )
                ? (record.endReason as CycleEndReason)
                : null,
            options: toOptions(record.options),
            items: Array.isArray(record.items)
                ? record.items
                      .map(toItem)
                      .filter((item): item is CycleItemRecord => item !== null)
                : [],
            startedBy: toRunPerson(record.startedBy) ?? {
                userId: "",
                login: "",
            },
            stoppedBy: toRunPerson(record.stoppedBy),
            startedAt: instantOrNull(record.startedAt),
            finishedAt: instantOrNull(record.finishedAt),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt: instantOrNull(record.deletedAt),
        };
    }

    toPersistence(
        input: AllOptional<CycleRecord> | Record<string, unknown>
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

export const cycleMapper = new CycleMapper();

export function toCycleDTO(cycle: CycleRecord): CycleDTO {
    return {
        id: cycle.id,
        boardId: cycle.boardId,
        status: cycle.status,
        endReason: cycle.endReason,
        options: cycle.options,
        items: cycle.items.map(({ cardId: _cardId, ...item }) => item),
        startedByLogin: cycle.startedBy.login,
        stoppedByLogin: cycle.stoppedBy?.login ?? null,
        startedAt: cycle.startedAt,
        finishedAt: cycle.finishedAt,
        createdAt: cycle.createdAt,
        updatedAt: cycle.updatedAt,
    };
}
