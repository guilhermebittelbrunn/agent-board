import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
    credentialIdOf,
    credentialMapper,
    toScheduledTaskCredentialDTO,
    toSealedSecret,
} from "@/(shared)/mappers/credential.mapper";

const AT = "2026-11-27T05:00:00.000Z";
const at = () => Timestamp.fromDate(new Date(AT));

const row = {
    id: "b1__u1__analyze",
    userId: "u1",
    boardId: "b1",
    stageKey: "analyze",
    kind: "scheduled_task",
    sealed: "v1.iv.tag.body",
    triggerIdLast4: "EFGH",
    tokenLast4: "WXYZ",
    lastCheckedAt: null,
    lastCheckStatus: null,
    createdAt: at(),
    updatedAt: at(),
    deletedAt: null,
};

describe("credentialMapper", () => {
    it("turns Timestamps into ISO and leaves the sealed secret out", () => {
        const record = credentialMapper.toDTO(row);

        expect(record).toEqual({
            id: "b1__u1__analyze",
            userId: "u1",
            boardId: "b1",
            stageKey: "analyze",
            kind: "scheduled_task",
            triggerIdLast4: "EFGH",
            tokenLast4: "WXYZ",
            lastCheckedAt: null,
            lastCheckStatus: null,
            createdAt: AT,
            updatedAt: AT,
            deletedAt: null,
        });
        expect(toSealedSecret(row)).toBe("v1.iv.tag.body");
    });

    it("reads an unknown check status as null and a check instant as ISO", () => {
        const record = credentialMapper.toDTO({
            ...row,
            lastCheckedAt: at(),
            lastCheckStatus: "maybe",
        });
        expect(record.lastCheckedAt).toBe(AT);
        expect(record.lastCheckStatus).toBeNull();
    });

    it("answers the DTO with only the last characters", () => {
        const dto = toScheduledTaskCredentialDTO(credentialMapper.toDTO(row));
        expect(Object.keys(dto).sort()).toEqual([
            "lastCheckStatus",
            "lastCheckedAt",
            "stageKey",
            "tokenLast4",
            "triggerIdLast4",
            "updatedAt",
        ]);
    });

    it("keys a credential by board, person and stage", () => {
        expect(
            credentialIdOf({ boardId: "b1", userId: "u1", stageKey: "analyze" })
        ).toBe("b1__u1__analyze");
    });
});
