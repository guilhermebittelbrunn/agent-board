import type { UserDTO } from "@repo/sdk/src/types";
import db from "../infra/database";
import { BaseRepository } from "./base.repository";

class UserRepository extends BaseRepository<UserDTO> {
    constructor() {
        super(db, "user");
    }

    async findByReferenceId(referenceId: string): Promise<UserDTO | null> {
        const querySnapshot = await this.db
            .collection(this.table)
            .where("reference_id", "==", referenceId)
            .where("deletedAt", "==", null)
            .get();

        if (querySnapshot.docs.length === 0) {
            return null;
        }

        return {
            ...(querySnapshot.docs[0].data() as UserDTO),
            id: querySnapshot.docs[0].id,
        };
    }

    /**
     * A single-field query, so the automatic index serves it. The archived check runs in
     * memory because a uid maps to one profile, rarely two.
     */
    async hasArchivedProfile(referenceId: string): Promise<boolean> {
        const querySnapshot = await this.db
            .collection(this.table)
            .where("reference_id", "==", referenceId)
            .select("deletedAt")
            .get();

        return querySnapshot.docs.some(
            (docSnap) => docSnap.data().deletedAt != null
        );
    }
}

export const userRepository = new UserRepository();
