import type { DocumentSnapshot } from "firebase-admin/firestore";
import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import { pickClaimable } from "@/(shared)/lib/runner/runner-claim";
import db from "../infra/database";
import { RUN_TABLE, type RunRecord, runMapper } from "../mappers/run.mapper";
import {
    RUNNER_REGISTRATION_TABLE,
    RUNNER_TABLE,
    type RunnerRecord,
    runnerMapper,
    toRunnerTokenHash,
} from "../mappers/runner.mapper";
import { BaseRepository } from "./base.repository";

export type RunnerWithToken = {
    runner: RunnerRecord;
    tokenHash: string | null;
};

export type MintedToken = { token: string; tokenHash: string };

export type MintedRunnerToken = MintedToken & { tokenLast4: string };

export type RegisterResult =
    | { ok: true; runner: RunnerRecord; token: string }
    | { ok: false };

export type ClaimResult = { run: RunRecord; token: string } | null;

export type RunnerRunCheck =
    | { ok: true; run: RunRecord }
    | { ok: false; code: "RUNNER_RUN_MISMATCH" };

export type RunnerFinishWrite = { turns: number };

export type RunnerFinishResult =
    | { ok: true; run: RunRecord; recorded: boolean }
    | { ok: false; code: "RUNNER_RUN_MISMATCH" };

function liveRow(snapshot: DocumentSnapshot): Record<string, unknown> | null {
    const data = snapshot.data();
    if (!(snapshot.exists && data) || data.deletedAt != null) {
        return null;
    }
    return data;
}

/**
 * Local runners and their claims. Claiming a run, finishing it and registering a runner are
 * transactions: two runners of the same person polling at once, or a finish sent twice,
 * cannot both win.
 */
class RunnerRepository extends BaseRepository<RunnerRecord> {
    constructor() {
        super(db, RUNNER_TABLE, runnerMapper);
    }

    private runRef(runId: string) {
        return this.db.collection(RUN_TABLE).doc(runId);
    }

    private toRun(snapshot: DocumentSnapshot): RunRecord | null {
        const data = liveRow(snapshot);
        return data ? runMapper.toDTO({ id: snapshot.id, ...data }) : null;
    }

    async listByUser(userId: string): Promise<RunnerRecord[]> {
        const snapshot = await this.db
            .collection(this.table)
            .where("userId", "==", userId)
            .get();
        return snapshot.docs
            .map((docSnap) => this.toDTO(docSnap.id, docSnap.data()))
            .filter((runner) => runner.deletedAt === null);
    }

    /** Revoked runners included, so the guard can tell a revoked token from a forged one. */
    async findWithToken(runnerId: string): Promise<RunnerWithToken | null> {
        if (!isUsableDocumentId(runnerId)) {
            return null;
        }
        const snapshot = await this.db
            .collection(this.table)
            .doc(runnerId)
            .get();
        const data = snapshot.data();
        if (!(snapshot.exists && data)) {
            return null;
        }
        return {
            runner: this.toDTO(snapshot.id, data),
            tokenHash: toRunnerTokenHash(data),
        };
    }

    async touch(runnerId: string, now: Date): Promise<void> {
        await this.db
            .collection(this.table)
            .doc(runnerId)
            .update({ lastSeenAt: now, updatedAt: now });
    }

    async createRegistration(input: {
        userId: string;
        codeHash: string;
        expiresAt: Date;
        now: Date;
    }): Promise<void> {
        await this.db
            .collection(RUNNER_REGISTRATION_TABLE)
            .doc(input.codeHash)
            .create({
                userId: input.userId,
                expiresAt: input.expiresAt,
                usedAt: null,
                runnerId: null,
                createdAt: input.now,
            });
    }

    /**
     * Spends a registration code and creates the runner in the same transaction, so a code
     * registers one runner at most. An unknown, expired or used code gets the same answer.
     */
    async registerWithCode(input: {
        codeHash: string;
        name: string;
        mint: (runnerId: string) => MintedRunnerToken;
        now: Date;
    }): Promise<RegisterResult> {
        if (!isUsableDocumentId(input.codeHash)) {
            return { ok: false };
        }
        const { now } = input;
        const registrationRef = this.db
            .collection(RUNNER_REGISTRATION_TABLE)
            .doc(input.codeHash);
        const runnerRef = this.db.collection(this.table).doc();
        return await this.db.runTransaction(
            async (transaction): Promise<RegisterResult> => {
                const snapshot = await transaction.get(registrationRef);
                const data = snapshot.data();
                if (!(snapshot.exists && data) || data.usedAt != null) {
                    return { ok: false };
                }
                const expiresAt = data.expiresAt as { toDate?: () => Date };
                const expiry =
                    typeof expiresAt?.toDate === "function"
                        ? expiresAt.toDate()
                        : new Date(String(data.expiresAt));
                if (!(expiry.getTime() > now.getTime())) {
                    return { ok: false };
                }
                const userId = String(data.userId ?? "");
                const minted = input.mint(runnerRef.id);
                const document = {
                    userId,
                    name: input.name,
                    tokenHash: minted.tokenHash,
                    tokenLast4: minted.tokenLast4,
                    lastSeenAt: now,
                    currentRunId: null,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                };
                transaction.set(runnerRef, document);
                transaction.update(registrationRef, {
                    usedAt: now,
                    runnerId: runnerRef.id,
                });
                return {
                    ok: true,
                    runner: this.toDTO(runnerRef.id, document),
                    token: minted.token,
                };
            }
        );
    }

    /** A runner of another person reads as missing, so ids do not leak across people. */
    async revokeOwned(
        runnerId: string,
        userId: string,
        now: Date
    ): Promise<boolean> {
        if (!isUsableDocumentId(runnerId)) {
            return false;
        }
        const ref = this.db.collection(this.table).doc(runnerId);
        return await this.db.runTransaction(async (transaction) => {
            const data = liveRow(await transaction.get(ref));
            if (data === null || data.userId !== userId) {
                return false;
            }
            transaction.update(ref, {
                deletedAt: now,
                currentRunId: null,
                updatedAt: now,
            });
            return true;
        });
    }

    async findRunsByIds(runIds: string[]): Promise<Map<string, RunRecord>> {
        const usable = runIds.filter(isUsableDocumentId);
        if (usable.length === 0) {
            return new Map();
        }
        const snapshots = await this.db.getAll(
            ...usable.map((runId) => this.runRef(runId))
        );
        const runs = new Map<string, RunRecord>();
        for (const snapshot of snapshots) {
            const run = this.toRun(snapshot);
            if (run !== null) {
                runs.set(run.id, run);
            }
        }
        return runs;
    }

    /**
     * Gives this runner the oldest local run its owner triggered, with a fresh agent token
     * that expires with the run's deadline. A runner still busy with a live run gets nothing:
     * one run at a time is kept here, not only in the CLI.
     */
    async claimNext(
        runner: Pick<RunnerRecord, "id">,
        mint: (runId: string) => MintedToken,
        now: Date
    ): Promise<ClaimResult> {
        const runnerRef = this.db.collection(this.table).doc(runner.id);
        return await this.db.runTransaction(
            async (transaction): Promise<ClaimResult> => {
                const runnerData = liveRow(await transaction.get(runnerRef));
                if (runnerData === null) {
                    return null;
                }
                const stored = this.toDTO(runner.id, runnerData);
                if (stored.currentRunId !== null) {
                    const current = this.toRun(
                        await transaction.get(this.runRef(stored.currentRunId))
                    );
                    if (current?.active) {
                        return null;
                    }
                }
                const candidates = await transaction.get(
                    this.db
                        .collection(RUN_TABLE)
                        .where("executor", "==", "local")
                        .where("active", "==", true)
                        .where("runnerId", "==", null)
                        .where("triggeredBy.userId", "==", stored.userId)
                );
                const run = pickClaimable(
                    candidates.docs.map((docSnap) =>
                        runMapper.toDTO({ id: docSnap.id, ...docSnap.data() })
                    ),
                    stored,
                    now
                );
                if (run === null || run.deadlineAt === null) {
                    if (stored.currentRunId !== null) {
                        transaction.update(runnerRef, {
                            currentRunId: null,
                            updatedAt: now,
                        });
                    }
                    return null;
                }
                const { token, tokenHash } = mint(run.id);
                transaction.update(this.runRef(run.id), {
                    runnerId: runner.id,
                    claimedAt: now,
                    tokenHash,
                    tokenExpiresAt: new Date(run.deadlineAt),
                    updatedAt: now,
                });
                transaction.update(runnerRef, {
                    currentRunId: run.id,
                    lastSeenAt: now,
                    updatedAt: now,
                });
                return {
                    run: {
                        ...run,
                        runnerId: runner.id,
                        claimedAt: now.toISOString(),
                    },
                    token,
                };
            }
        );
    }

    async recordTurns(
        runner: Pick<RunnerRecord, "id">,
        runId: string,
        turns: number,
        now: Date
    ): Promise<RunnerRunCheck> {
        if (!isUsableDocumentId(runId)) {
            return { ok: false, code: "RUNNER_RUN_MISMATCH" };
        }
        const ref = this.runRef(runId);
        return await this.db.runTransaction(
            async (transaction): Promise<RunnerRunCheck> => {
                const run = this.toRun(await transaction.get(ref));
                if (run === null || run.runnerId !== runner.id) {
                    return { ok: false, code: "RUNNER_RUN_MISMATCH" };
                }
                if (run.active) {
                    transaction.update(ref, { turns, updatedAt: now });
                }
                return { ok: true, run: { ...run, turns } };
            }
        );
    }

    /**
     * Records the end of a run on the runner side and frees the runner. The first finish
     * wins; a repeated one reports `recorded: false` and writes nothing.
     */
    async finishRun(
        runner: Pick<RunnerRecord, "id">,
        runId: string,
        write: RunnerFinishWrite,
        now: Date
    ): Promise<RunnerFinishResult> {
        if (!isUsableDocumentId(runId)) {
            return { ok: false, code: "RUNNER_RUN_MISMATCH" };
        }
        const ref = this.runRef(runId);
        const runnerRef = this.db.collection(this.table).doc(runner.id);
        return await this.db.runTransaction(
            async (transaction): Promise<RunnerFinishResult> => {
                const run = this.toRun(await transaction.get(ref));
                if (run === null || run.runnerId !== runner.id) {
                    return { ok: false, code: "RUNNER_RUN_MISMATCH" };
                }
                const runnerData = (await transaction.get(runnerRef)).data();
                if (run.runnerFinishedAt !== null) {
                    return { ok: true, run, recorded: false };
                }
                transaction.update(ref, {
                    turns: write.turns,
                    runnerFinishedAt: now,
                    updatedAt: now,
                });
                if (runnerData?.currentRunId === runId) {
                    transaction.update(runnerRef, {
                        currentRunId: null,
                        updatedAt: now,
                    });
                }
                return {
                    ok: true,
                    run: {
                        ...run,
                        turns: write.turns,
                        runnerFinishedAt: now.toISOString(),
                    },
                    recorded: true,
                };
            }
        );
    }
}

export const runnerRepository = new RunnerRepository();
