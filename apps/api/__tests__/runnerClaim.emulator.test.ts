import { randomUUID } from "node:crypto";
import { parseBoardConfig } from "@repo/kanban-contract";
import type { BoardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => null,
}));

// Attachments are read through the Storage module, which would validate every variable of `@/env`.
vi.mock("@/env", () => ({ env: { FIREBASE_STORAGE_BUCKET: "" } }));

const { getFirestoreAdmin } = await import("@repo/auth/server");
const { SAMPLE_BOARD_CONFIGS } = await import(
    "@/(shared)/lib/github/github-sample-repositories"
);
const { boardMapper } = await import("@/(shared)/mappers/board.mapper");
const { runnerRepository } = await import(
    "@/(shared)/repositories/runner.repository"
);
const { runRepository } = await import(
    "@/(shared)/repositories/run.repository"
);
const { triggerStage, tick } = await import(
    "@/(shared)/lib/orchestrator/orchestrator"
);
const { mintRunToken } = await import(
    "@/(shared)/lib/agent-contract/run-token"
);
const { POST: TOOL } = await import("@/app/(routes)/agent/tools/[tool]/route");

const RUN_ID_LENGTH = 8;
const RUNNER_NAME_ID_LENGTH = 6;
const SECRET_LENGTH = 43;
const OFFLINE_FOR_MS = 300_000;
const PAST_GRACE_MS = 180_000;
const RUN_ID = randomUUID().slice(0, RUN_ID_LENGTH);
const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
if (!parsed.success) {
    throw new Error("sample config is invalid");
}
const config = parsed.data;
const usedBoards: string[] = [];
const usedRunners: string[] = [];
let count = 0;

const db = () => getFirestoreAdmin();

async function createBoard(): Promise<BoardDTO> {
    count += 1;
    const id = `emu-runner-${RUN_ID}-${count}`;
    usedBoards.push(id);
    const at = new Date("2026-11-26T09:00:00.000Z");
    const document = {
        ownerUserId: "p-owner",
        ownerGithubId: "1",
        name: "sample-app",
        repository: {
            installationId: 1,
            owner: "agent-board-demo",
            name: "sample-app",
            fullName: "agent-board-demo/sample-app",
            defaultBranch: "main",
            private: false,
        },
        config,
        configSource: {
            path: ".kanban/board.yml",
            ref: "main",
            sha: "x",
            readAt: at,
        },
        stageSettings: {},
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
    };
    await db().collection("board").doc(id).set(document);
    return boardMapper.toDTO({ id, ...document });
}

async function seedCard(board: BoardDTO, slug: string): Promise<void> {
    const at = new Date("2026-11-26T09:00:00.000Z");
    await db()
        .collection("card")
        .doc(`${board.id}__${slug}`)
        .set({
            boardId: board.id,
            slug,
            title: slug,
            spec: {
                path: `specs/features/${slug}.md`,
                sha: "x",
                status: "approved",
            },
            ready: true,
            orphan: false,
            lane: "tasks",
            stageKey: null,
            state: "idle",
            reworkLoops: 0,
            order: 0,
            branch: `feat/${slug}`,
            movedAt: null,
            movedByUserId: null,
            syncedAt: at,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
        });
}

async function createRunner(userId: string, lastSeenAt = new Date()) {
    const ref = db().collection("runner").doc();
    usedRunners.push(ref.id);
    await ref.set({
        userId,
        name: `emu-${ref.id.slice(0, RUNNER_NAME_ID_LENGTH)}`,
        tokenHash: "x",
        tokenLast4: "abcd",
        lastSeenAt,
        currentRunId: null,
        createdAt: lastSeenAt,
        updatedAt: lastSeenAt,
        deletedAt: null,
    });
    return { id: ref.id };
}

async function triggerAs(userId: string, slug: string) {
    const board = await createBoard();
    await seedCard(board, slug);
    const triggered = await triggerStage({
        board,
        slug,
        stageKey: "analyze",
        by: { userId, login: userId },
    });
    if (!triggered.ok) {
        throw new Error(`trigger refused: ${triggered.code}`);
    }
    return { board, run: triggered.run };
}

afterAll(async () => {
    for (const boardId of usedBoards) {
        for (const collection of ["card", "run", "cardEvent"]) {
            const snapshot = await db()
                .collection(collection)
                .where("boardId", "==", boardId)
                .get();
            await Promise.all(
                snapshot.docs.map((docSnap) => docSnap.ref.delete())
            );
        }
        await db().collection("board").doc(boardId).delete();
    }
    await Promise.all(
        usedRunners.map((id) => db().collection("runner").doc(id).delete())
    );
});

describe("runner claim against the Firestore emulator", () => {
    it("gives a local run to one of two runners polling at once, with a token the agent guard accepts", async () => {
        const userId = `u-race-${RUN_ID}`;
        const first = await createRunner(userId);
        const second = await createRunner(userId);
        const { run } = await triggerAs(userId, "claim-race");
        expect(run.executor).toBe("local");

        const now = new Date();
        const results = await Promise.all([
            runnerRepository.claimNext(first, mintRunToken, now),
            runnerRepository.claimNext(second, mintRunToken, now),
        ]);
        const winners = results.filter((result) => result !== null);
        expect(winners).toHaveLength(1);
        const [winner] = winners;
        if (winner === null || winner === undefined) {
            throw new Error("no runner claimed the run");
        }

        const stored = (await db().collection("run").doc(run.id).get()).data();
        expect(stored?.tokenExpiresAt).toBeInstanceOf(Timestamp);
        expect([first.id, second.id]).toContain(stored?.runnerId);
        expect(JSON.stringify(stored)).not.toContain(
            winner.token.slice(-SECRET_LENGTH)
        );

        const response = await TOOL(
            new Request("http://localhost:3002/agent/tools/get_card", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${winner.token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ cardId: run.cardId }),
            }) as unknown as NextRequest,
            { params: Promise.resolve({ tool: "get_card" }) }
        );
        expect(response.status).toBe(HTTP_STATUS.OK);

        const busyRunner = stored?.runnerId as string;
        expect(
            await runnerRepository.claimNext(
                { id: busyRunner },
                mintRunToken,
                new Date()
            )
        ).toBeNull();
    });

    it("never hands a runner a run someone else triggered", async () => {
        const owner = `u-owner-${RUN_ID}`;
        const other = `u-other-${RUN_ID}`;
        await createRunner(owner);
        const otherRunner = await createRunner(other);
        const { run } = await triggerAs(owner, "own-use");
        expect(run.executor).toBe("local");

        expect(
            await runnerRepository.claimNext(
                otherRunner,
                mintRunToken,
                new Date()
            )
        ).toBeNull();
    });

    it("ends with no_runner a run whose person has no runner online, outside the fake executor", async () => {
        const userId = `u-offline-${RUN_ID}`;
        await createRunner(userId, new Date(Date.now() - OFFLINE_FOR_MS));
        const { run } = await triggerAs(userId, "offline");

        expect(run.executor).toBe("fake");
    });

    it("ends an unclaimed local run with no_runner after the grace period", async () => {
        const userId = `u-grace-${RUN_ID}`;
        await createRunner(userId);
        const { board, run } = await triggerAs(userId, "grace");
        expect(run.executor).toBe("local");

        await tick(board, new Date(Date.now() + PAST_GRACE_MS));

        const after = await runRepository.findById(run.id);
        expect(after?.active).toBe(false);
        expect(after?.endReason).toBe("no_runner");
    });
});
