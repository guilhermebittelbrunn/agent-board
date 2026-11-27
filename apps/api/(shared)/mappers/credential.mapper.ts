import {
    CREDENTIAL_CHECK_STATUSES,
    CREDENTIAL_KINDS,
    type CredentialCheckStatus,
    type CredentialKind,
} from "@repo/kanban-contract";
import type { ScheduledTaskCredentialDTO } from "@repo/sdk/src/types";
import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import Mapper from "./Mapper";

export const CREDENTIAL_TABLE = "credential";

export type CredentialFirestoreRow = Record<string, unknown> & { id: string };

/**
 * The stored credential as the API sees it. The sealed secret is read apart (`toSealedSecret`),
 * so it never travels with the credential into a log or a DTO.
 */
export type CredentialRecord = {
    id: string;
    userId: string;
    boardId: string;
    stageKey: string;
    kind: CredentialKind;
    triggerIdLast4: string;
    tokenLast4: string;
    lastCheckedAt: string | null;
    lastCheckStatus: CredentialCheckStatus | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

/** One credential per person, board and stage; saving again overwrites the same document. */
export const credentialIdOf = (input: {
    boardId: string;
    userId: string;
    stageKey: string;
}): string => `${input.boardId}__${input.userId}__${input.stageKey}`;

const instantOrNull = (value: unknown): string | null =>
    value == null ? null : normalizeFirestoreInstant(value);

const textOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

function memberOf<T extends string>(
    values: readonly T[],
    value: unknown
): T | null {
    return values.find((candidate) => candidate === value) ?? null;
}

class CredentialMapper extends Mapper<
    CredentialFirestoreRow,
    CredentialRecord
> {
    toDTO(row: CredentialFirestoreRow): CredentialRecord {
        const { id, ...record } = row;
        return {
            id,
            userId: String(record.userId ?? ""),
            boardId: String(record.boardId ?? ""),
            stageKey: String(record.stageKey ?? ""),
            kind: memberOf(CREDENTIAL_KINDS, record.kind) ?? "scheduled_task",
            triggerIdLast4: String(record.triggerIdLast4 ?? ""),
            tokenLast4: String(record.tokenLast4 ?? ""),
            lastCheckedAt: instantOrNull(record.lastCheckedAt),
            lastCheckStatus: memberOf(
                CREDENTIAL_CHECK_STATUSES,
                record.lastCheckStatus
            ),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt: instantOrNull(record.deletedAt),
        };
    }

    toPersistence(
        input: AllOptional<CredentialRecord> | Record<string, unknown>
    ): AllOptional<Record<string, unknown>> {
        const { id: _id, ...rest } = input as Record<string, unknown>;
        return rest as AllOptional<Record<string, unknown>>;
    }
}

export const credentialMapper = new CredentialMapper();

export function toSealedSecret(row: Record<string, unknown>): string | null {
    return textOrNull(row.sealed);
}

export function toScheduledTaskCredentialDTO(
    credential: CredentialRecord
): ScheduledTaskCredentialDTO {
    return {
        stageKey: credential.stageKey,
        triggerIdLast4: credential.triggerIdLast4,
        tokenLast4: credential.tokenLast4,
        lastCheckedAt: credential.lastCheckedAt,
        lastCheckStatus: credential.lastCheckStatus,
        updatedAt: credential.updatedAt,
    };
}
