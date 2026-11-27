import {
    type ScheduledTaskInput,
    scheduledTaskIdOf,
} from "@repo/kanban-contract";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { sealSecret } from "@/(shared)/lib/credentials/secret-box";
import { isUsableDocumentId } from "@/(shared)/lib/pagination";
import db from "../infra/database";
import {
    CREDENTIAL_TABLE,
    type CredentialRecord,
    credentialIdOf,
    credentialMapper,
    toSealedSecret,
} from "../mappers/credential.mapper";
import { BaseRepository } from "./base.repository";

type CredentialOwner = { boardId: string; userId: string; stageKey: string };

const LAST_CHARS = 4;
const lastChars = (value: string): string => value.slice(-LAST_CHARS);

function liveRow(snapshot: DocumentSnapshot): Record<string, unknown> | null {
    const data = snapshot.data();
    if (!(snapshot.exists && data) || data.deletedAt != null) {
        return null;
    }
    return data;
}

const ownedBy = (
    data: Record<string, unknown>,
    owner: CredentialOwner
): boolean =>
    data.userId === owner.userId &&
    data.boardId === owner.boardId &&
    data.stageKey === owner.stageKey;

/**
 * Credentials a person keeps per board and stage. Every read and write is keyed by the
 * person, so nobody reaches another member's credential, the owner included.
 */
class CredentialRepository extends BaseRepository<CredentialRecord> {
    constructor() {
        super(db, CREDENTIAL_TABLE, credentialMapper);
    }

    async listOwned(
        boardId: string,
        userId: string
    ): Promise<CredentialRecord[]> {
        const snapshot = await this.db
            .collection(this.table)
            .where("boardId", "==", boardId)
            .where("userId", "==", userId)
            .get();
        return snapshot.docs
            .map((docSnap) => this.toDTO(docSnap.id, docSnap.data()))
            .filter((credential) => credential.deletedAt === null);
    }

    /** Seals the fire URL and the token together, bound to this document's id. */
    async saveScheduledTask(
        input: CredentialOwner & {
            task: ScheduledTaskInput;
            key: Buffer;
            now: Date;
        }
    ): Promise<CredentialRecord> {
        const id = credentialIdOf(input);
        const triggerId = scheduledTaskIdOf(input.task.fireUrl);
        if (!(isUsableDocumentId(id) && triggerId)) {
            throw new Error("Unusable scheduled task credential");
        }
        const ref = this.db.collection(this.table).doc(id);
        const { now } = input;
        return await this.db.runTransaction(async (transaction) => {
            const existing = (await transaction.get(ref)).data();
            if (existing && !ownedBy(existing, input)) {
                throw new Error("Credential id collides with another owner");
            }
            const document = {
                userId: input.userId,
                boardId: input.boardId,
                stageKey: input.stageKey,
                kind: "scheduled_task",
                sealed: sealSecret(
                    input.key,
                    JSON.stringify({
                        fireUrl: input.task.fireUrl,
                        token: input.task.token,
                    }),
                    id
                ),
                triggerIdLast4: lastChars(triggerId),
                tokenLast4: lastChars(input.task.token),
                lastCheckedAt: null,
                lastCheckStatus: null,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                deletedAt: null,
            };
            transaction.set(ref, document);
            return this.toDTO(id, document);
        });
    }

    /** The sealed secret of a live credential, for the executor that fires the scheduled task. */
    async findSealed(owner: CredentialOwner): Promise<string | null> {
        const id = credentialIdOf(owner);
        if (!isUsableDocumentId(id)) {
            return null;
        }
        const data = liveRow(
            await this.db.collection(this.table).doc(id).get()
        );
        return data && ownedBy(data, owner) ? toSealedSecret(data) : null;
    }

    /** Soft delete that also drops the sealed secret; `false` when the person has nothing there. */
    async removeOwned(owner: CredentialOwner, now: Date): Promise<boolean> {
        const id = credentialIdOf(owner);
        if (!isUsableDocumentId(id)) {
            return false;
        }
        const ref = this.db.collection(this.table).doc(id);
        return await this.db.runTransaction(async (transaction) => {
            const data = liveRow(await transaction.get(ref));
            if (data === null || !ownedBy(data, owner)) {
                return false;
            }
            transaction.update(ref, {
                sealed: null,
                deletedAt: now,
                updatedAt: now,
            });
            return true;
        });
    }
}

export const credentialRepository = new CredentialRepository();
