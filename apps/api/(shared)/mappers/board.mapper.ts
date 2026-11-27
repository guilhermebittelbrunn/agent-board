import { type BoardConfig, parseBoardConfig } from "@repo/kanban-contract";
import type {
    BoardBacklogSyncDTO,
    BoardConfigSourceDTO,
    BoardDTO,
    BoardRepositoryDTO,
    BoardStageSettingsDTO,
} from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import Mapper from "./Mapper";

export type BoardFirestoreRow = Record<string, unknown> & { id: string };

/** What the API writes: the read instant is a `Date`, stored as a Firestore timestamp. */
export type BoardRecordInput = Omit<
    BoardDTO,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
    | "configSource"
    | "backlogSync"
    | "stageSettings"
> & {
    configSource: Omit<BoardConfigSourceDTO, "readAt"> & { readAt: Date };
};

export type BoardBacklogSyncInput = Omit<BoardBacklogSyncDTO, "syncedAt"> & {
    syncedAt: Date;
};

const PERSISTED_KEYS = [
    "ownerUserId",
    "ownerGithubId",
    "name",
    "repository",
    "config",
    "configSource",
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

/**
 * Firestore refuses `undefined` anywhere in a document, and an optional key of the board
 * config (`agent`, `onRework`, ...) can arrive set to `undefined` instead of absent.
 */
export function withoutUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => withoutUndefined(item)) as T;
    }
    if (value === null || typeof value !== "object" || value instanceof Date) {
        return value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) {
            out[key] = withoutUndefined(item);
        }
    }
    return out as T;
}

/**
 * The stored config is the one parsed at import or at the last reload, so a board read
 * after the schema gained a field (`specAuthoring`, `stages[].runners`, ...) lacks it.
 * Parsing again fills those defaults; a config the current rules refuse stays as stored.
 */
function toBoardConfig(value: unknown): BoardConfig {
    const parsed = parseBoardConfig(value);
    return parsed.success ? parsed.data : (value as BoardConfig);
}

function toBacklogSync(value: unknown): BoardBacklogSyncDTO | null {
    if (value === null || typeof value !== "object") {
        return null;
    }
    const sync = value as Record<string, unknown>;
    return {
        indexPath: String(sync.indexPath ?? ""),
        indexSha: String(sync.indexSha ?? ""),
        ref: String(sync.ref ?? ""),
        syncedAt: normalizeFirestoreInstant(sync.syncedAt),
        specCount: typeof sync.specCount === "number" ? sync.specCount : 0,
    };
}

const MIN_WIP_LIMIT = 1;

/**
 * Only the stages `board.yml` still declares, and the approval gate only where the stage
 * lets the board choose: `required` always asks and `none` never does.
 */
export function toStageSettings(
    value: unknown,
    config: BoardConfig | undefined
): BoardStageSettingsDTO {
    const stored = asRecord(value);
    const settings: BoardStageSettingsDTO = {};
    for (const stage of config?.stages ?? []) {
        if (!(stage.key in stored)) {
            continue;
        }
        const entry = asRecord(stored[stage.key]);
        const wipLimit =
            typeof entry.wipLimit === "number" &&
            Number.isInteger(entry.wipLimit) &&
            entry.wipLimit >= MIN_WIP_LIMIT
                ? entry.wipLimit
                : null;
        settings[stage.key] = {
            wipLimit,
            approvalGate:
                stage.approval === "optional" && entry.approvalGate === true,
        };
    }
    return settings;
}

class BoardMapper extends Mapper<BoardFirestoreRow, BoardDTO> {
    toDTO(row: BoardFirestoreRow): BoardDTO {
        const { id, ...record } = row;
        const repository = asRecord(record.repository);
        const source = asRecord(record.configSource);
        const config = toBoardConfig(record.config);

        return {
            id,
            ownerUserId: String(record.ownerUserId ?? ""),
            ownerGithubId: String(record.ownerGithubId ?? ""),
            name: String(record.name ?? ""),
            repository: {
                installationId: Number(repository.installationId ?? 0),
                owner: String(repository.owner ?? ""),
                name: String(repository.name ?? ""),
                fullName: String(repository.fullName ?? ""),
                defaultBranch: String(repository.defaultBranch ?? ""),
                private: Boolean(repository.private ?? false),
            } satisfies BoardRepositoryDTO,
            config,
            configSource: {
                path: String(source.path ?? ""),
                ref: String(source.ref ?? ""),
                sha: String(source.sha ?? ""),
                readAt: normalizeFirestoreInstant(source.readAt),
            },
            backlogSync: toBacklogSync(record.backlogSync),
            stageSettings: toStageSettings(record.stageSettings, config),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt:
                record.deletedAt == null
                    ? null
                    : normalizeFirestoreInstant(record.deletedAt),
        };
    }

    toPersistence(
        input: AllOptional<BoardDTO> | Partial<BoardRecordInput>
    ): AllOptional<Record<string, unknown>> {
        const source = input as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of PERSISTED_KEYS) {
            if (source[key] !== undefined) {
                out[key] = withoutUndefined(source[key]);
            }
        }
        return out as AllOptional<Record<string, unknown>>;
    }
}

export const boardMapper = new BoardMapper();
