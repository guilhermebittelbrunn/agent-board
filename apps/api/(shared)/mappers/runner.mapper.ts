import type { RunnerDTO } from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import { isRunnerOnline } from "@/(shared)/lib/runner/runner-claim";
import Mapper from "./Mapper";
import type { RunRecord } from "./run.mapper";

export const RUNNER_TABLE = "runner";
export const RUNNER_REGISTRATION_TABLE = "runnerRegistration";

export type RunnerFirestoreRow = Record<string, unknown> & { id: string };

/**
 * The stored runner as the API sees it. The token hash is read apart (`toRunnerTokenHash`),
 * so it never travels with the runner into a log or a DTO.
 */
export type RunnerRecord = {
    id: string;
    userId: string;
    name: string;
    tokenLast4: string;
    lastSeenAt: string;
    /** The run this runner claimed and has not finished; one at a time. */
    currentRunId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

const instantOrNull = (value: unknown): string | null =>
    value == null ? null : normalizeFirestoreInstant(value);

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

class RunnerMapper extends Mapper<RunnerFirestoreRow, RunnerRecord> {
    toDTO(row: RunnerFirestoreRow): RunnerRecord {
        const { id, ...record } = row;
        return {
            id,
            userId: String(record.userId ?? ""),
            name: String(record.name ?? ""),
            tokenLast4: String(record.tokenLast4 ?? ""),
            lastSeenAt: normalizeFirestoreInstant(record.lastSeenAt),
            currentRunId: textOrNull(record.currentRunId),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt: instantOrNull(record.deletedAt),
        };
    }

    toPersistence(
        input: AllOptional<RunnerRecord> | Record<string, unknown>
    ): AllOptional<Record<string, unknown>> {
        const { id: _id, ...rest } = input as Record<string, unknown>;
        return rest as AllOptional<Record<string, unknown>>;
    }
}

export const runnerMapper = new RunnerMapper();

export function toRunnerTokenHash(row: Record<string, unknown>): string | null {
    return textOrNull(row.tokenHash);
}

export function toRunnerDTO(
    runner: RunnerRecord,
    currentRun: RunRecord | null,
    now: Date
): RunnerDTO {
    return {
        id: runner.id,
        name: runner.name,
        online: isRunnerOnline(runner, now),
        lastSeenAt: runner.lastSeenAt,
        createdAt: runner.createdAt,
        tokenLast4: runner.tokenLast4,
        currentRun: currentRun?.active
            ? {
                  boardId: currentRun.boardId,
                  cardId: currentRun.cardId,
                  slug: currentRun.slug,
                  stageKey: currentRun.stageKey,
              }
            : null,
    };
}
