import { randomUUID } from "node:crypto";
import { parseBoardConfig } from "@repo/kanban-contract";
import type { BoardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The agent routes read the spec through GitHub; without a client they answer with an
// empty spec, and the real module would validate every variable of `@/env`.
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
const { cardRepository } = await import(
    "@/(shared)/repositories/card.repository"
);
const { runRepository } = await import(
    "@/(shared)/repositories/run.repository"
);
const { triggerStage } = await import(
    "@/(shared)/lib/orchestrator/orchestrator"
);
const { issueRunToken } = await import(
    "@/(shared)/lib/agent-contract/run-token"
);
const { POST } = await import("@/app/(routes)/agent/tools/[tool]/route");

const RUN_ID = randomUUID();
const SECRET_LENGTH = 43;
const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
if (!parsed.success) {
    throw new Error("sample config is invalid");
}
const config = parsed.data;
const OCTO = { userId: "p-owner", login: "octo" };
const usedBoards: string[] = [];
let boardCount = 0;

const db = () => getFirestoreAdmin();

async function createBoard(): Promise<BoardDTO> {
    boardCount += 1;
    const id = `emu-agent-${RUN_ID}-${boardCount}`;
    usedBoards.push(id);
    const at = new Date("2026-11-26T09:00:00.000Z");
    const document = {
        ownerUserId: OCTO.userId,
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

async function startRun(slug: string) {
    const board = await createBoard();
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
    const triggered = await triggerStage({
        board,
        slug,
        stageKey: "analyze",
        by: OCTO,
    });
    if (!triggered.ok) {
        throw new Error(`trigger refused: ${triggered.code}`);
    }
    return { board, card: triggered.card, run: triggered.run };
}

const call = (tool: string, token: string, body: unknown) =>
    POST(
        new Request(`http://localhost:3002/agent/tools/${tool}`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        }) as unknown as NextRequest,
        { params: Promise.resolve({ tool }) }
    );

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
});

describe("agent contract against the Firestore emulator", () => {
    it("stores only the hash, with the expiry as a Timestamp the guard reads back", async () => {
        const { run } = await startRun("token-roundtrip");
        expect(run.status).toBe("running");

        const issued = await issueRunToken(run.id);
        if (!issued.ok) {
            throw new Error("token refused");
        }
        const stored = (await db().collection("run").doc(run.id).get()).data();

        expect(stored?.tokenExpiresAt).toBeInstanceOf(Timestamp);
        expect(issued.expiresAt).toBe(run.deadlineAt);
        expect(JSON.stringify(stored)).not.toContain(
            issued.token.slice(-SECRET_LENGTH)
        );
        expect(
            (await runRepository.findWithToken(run.id))?.token.tokenExpiresAt
        ).toBe(run.deadlineAt);

        const response = await call("get_card", issued.token, {
            cardId: run.cardId,
        });
        expect(response.status).toBe(HTTP_STATUS.OK);
    });

    it("ends the stage through completeRun once, then revokes the token's writes", async () => {
        const { run } = await startRun("token-revoked");
        const issued = await issueRunToken(run.id);
        if (!issued.ok) {
            throw new Error("token refused");
        }
        const ref = { cardId: run.cardId, stage: "analyze" };

        const update = await call("post_update", issued.token, {
            ...ref,
            markdown: "Reading the spec",
        });
        const first = await call("complete_stage", issued.token, {
            ...ref,
            outcome: "success",
            summary: "### Análise — plano pronto",
        });
        const again = await call("complete_stage", issued.token, {
            ...ref,
            outcome: "success",
            summary: "### Análise — de novo",
        });
        const late = await call("post_update", issued.token, {
            ...ref,
            markdown: "late",
        });

        expect(update.status).toBe(HTTP_STATUS.OK);
        expect(await first.json()).toEqual({ data: { ignored: false } });
        expect(await again.json()).toEqual({ data: { ignored: true } });
        expect(late.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await late.json()).toEqual({
            error: { code: "AGENT_RUN_CLOSED" },
        });

        const reports = (
            await db()
                .collection("cardEvent")
                .where("cardId", "==", run.cardId)
                .where("type", "==", "report")
                .get()
        ).docs.map((docSnap) => docSnap.data());
        expect(reports).toHaveLength(1);
        expect(reports[0]?.runId).toBe(run.id);

        const closed = await runRepository.findById(run.id);
        expect(closed).toMatchObject({
            active: false,
            outcome: "success",
            endReason: "agent",
        });
        const card = await cardRepository.findById(run.cardId);
        expect(card?.stageKey).not.toBe("analyze");
        expect(await issueRunToken(run.id)).toEqual({
            ok: false,
            code: "AGENT_RUN_CLOSED",
        });
    });

    it("refuses an ask once the card runs another run, in the transaction", async () => {
        const { run } = await startRun("ask-late");
        const issued = await issueRunToken(run.id);
        if (!issued.ok) {
            throw new Error("token refused");
        }
        await db()
            .collection("card")
            .doc(run.cardId)
            .update({ activeRunId: "newer-run" });

        const response = await call("ask", issued.token, {
            cardId: run.cardId,
            stage: "analyze",
            questions: [
                {
                    question: "Header or OAuth?",
                    header: "Auth",
                    options: [{ label: "Header" }, { label: "OAuth" }],
                },
            ],
        });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await response.json()).toEqual({
            error: { code: "AGENT_RUN_CLOSED" },
        });
        const card = await db().collection("card").doc(run.cardId).get();
        expect(card.data()?.pendingAsk ?? null).toBeNull();
        const questions = await db()
            .collection("cardEvent")
            .where("cardId", "==", run.cardId)
            .where("type", "==", "question")
            .get();
        expect(questions.size).toBe(0);
    });

    it("refuses a token past its expiry", async () => {
        const { run } = await startRun("token-expired");
        const issued = await issueRunToken(run.id);
        if (!issued.ok) {
            throw new Error("token refused");
        }
        await db()
            .collection("run")
            .doc(run.id)
            .update({ tokenExpiresAt: new Date(0) });

        const response = await call("get_card", issued.token, {
            cardId: run.cardId,
        });

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(await response.json()).toEqual({
            error: { code: "AGENT_TOKEN_EXPIRED" },
        });
    });
});
