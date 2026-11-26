import { parseBoardConfig } from "@repo/kanban-contract";
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import { toStageSettings } from "@/(shared)/mappers/board.mapper";
import {
    newRunDocument,
    runMapper,
    toRunDTO,
    toRunTokenState,
} from "@/(shared)/mappers/run.mapper";

const AT = "2026-11-26T10:00:00.000Z";
const at = () => Timestamp.fromDate(new Date(AT));
const config = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;

const NEW_RUN = {
    boardId: "b1",
    cardId: "b1__search-cards",
    slug: "search-cards",
    stageKey: "analyze",
    command: "/analyze",
    agent: null,
    model: "opus" as const,
    effort: "high" as const,
    maxTurns: 200,
    branch: "feat/search-cards",
    trigger: "drag" as const,
    triggeredBy: { userId: "p1", login: "octo" },
};

describe("runMapper", () => {
    it("reads a new run as queued and live, with nothing finished", () => {
        const run = runMapper.toDTO({
            id: "r1",
            ...newRunDocument(NEW_RUN, new Date(AT)),
        });

        expect(run).toMatchObject({
            id: "r1",
            status: "queued",
            active: true,
            executor: null,
            outcome: null,
            endReason: null,
            stoppedBy: null,
            queuedAt: AT,
            startedAt: null,
            deadlineAt: null,
            finishedAt: null,
            sessionUrl: null,
            turns: null,
            runnerId: null,
            claimedAt: null,
            runnerFinishedAt: null,
        });
    });

    it("turns Firestore timestamps into ISO strings", () => {
        const run = runMapper.toDTO({
            id: "r1",
            ...NEW_RUN,
            executor: "fake",
            status: "finished",
            active: false,
            outcome: "needs_rework",
            endReason: "agent",
            queuedAt: at(),
            startedAt: at(),
            deadlineAt: at(),
            finishedAt: at(),
            createdAt: at(),
            updatedAt: at(),
            deletedAt: null,
        });

        expect(run).toMatchObject({
            executor: "fake",
            status: "finished",
            outcome: "needs_rework",
            startedAt: AT,
            deadlineAt: AT,
            finishedAt: AT,
        });
    });

    it("keeps who triggered and who stopped out of the public run, except the login", () => {
        const dto = toRunDTO(
            runMapper.toDTO({
                id: "r1",
                ...newRunDocument(NEW_RUN, new Date(AT)),
            })
        );

        expect(dto.triggeredByLogin).toBe("octo");
        expect(dto).not.toHaveProperty("triggeredBy");
        expect(dto).not.toHaveProperty("stoppedBy");
        expect(dto).not.toHaveProperty("sessionUrl");
    });
});

describe("run agent token", () => {
    const SHA256_HEX_LENGTH = 64;
    const TOKEN_HASH = "f".repeat(SHA256_HEX_LENGTH);

    it("reads a run written before tokens existed as without one", () => {
        expect(toRunTokenState({ status: "running" })).toEqual({
            tokenHash: null,
            tokenExpiresAt: null,
        });
    });

    it("turns the expiry into ISO and keeps the hash out of the run and its DTO", () => {
        const row = {
            id: "r1",
            ...newRunDocument(NEW_RUN, new Date(AT)),
            tokenHash: TOKEN_HASH,
            tokenExpiresAt: at(),
        };

        expect(toRunTokenState(row)).toEqual({
            tokenHash: TOKEN_HASH,
            tokenExpiresAt: AT,
        });
        const run = runMapper.toDTO(row);
        expect(run).not.toHaveProperty("tokenHash");
        expect(JSON.stringify(toRunDTO(run))).not.toContain(TOKEN_HASH);
    });

    it("creates every run with no token", () => {
        expect(newRunDocument(NEW_RUN, new Date(AT))).toMatchObject({
            tokenHash: null,
            tokenExpiresAt: null,
        });
    });
});

describe("toStageSettings", () => {
    it("is empty when the board never chose anything", () => {
        expect(toStageSettings(undefined, config)).toEqual({});
    });

    it("drops stages that left board.yml and gates where the stage does not allow it", () => {
        expect(
            toStageSettings(
                {
                    analyze: { wipLimit: 2, approvalGate: true },
                    develop: { wipLimit: 0, approvalGate: true },
                    deploy: { wipLimit: 1, approvalGate: false },
                },
                config
            )
        ).toEqual({
            analyze: { wipLimit: 2, approvalGate: true },
            develop: { wipLimit: null, approvalGate: false },
        });
    });
});
