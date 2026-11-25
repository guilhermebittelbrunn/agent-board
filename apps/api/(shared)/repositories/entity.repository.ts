import type { EntityDTO, EntitySummaryDTO } from "@repo/sdk/src/types";
import { EntityType } from "@repo/sdk/src/types";
import type { Query } from "firebase-admin/firestore";
import db from "../infra/database";
import { entityMapper } from "../mappers/entity.mapper";
import {
    BaseRepository,
    type PageRequest,
    type RepositoryPage,
} from "./base.repository";

class EntityRepository extends BaseRepository<EntityDTO> {
    constructor() {
        super(db, "entity", entityMapper);
    }

    /** The one place that decides which records a person can reach. */
    private ownedBy(userId: string): Query {
        return this.db.collection(this.table).where("userId", "==", userId);
    }

    /**
     * `null` for a record of someone else or a soft-deleted one. The empty id is refused
     * explicitly, so a record stored without an owner is never handed to anyone.
     */
    async findOwnedBy(id: string, userId: string): Promise<EntityDTO | null> {
        if (!userId) {
            return null;
        }
        const row = await this.findById(id);
        return row && row.userId === userId ? row : null;
    }

    listByUser(
        userId: string,
        page: PageRequest
    ): Promise<RepositoryPage<EntityDTO>> {
        return this.paginate(
            this.ownedBy(userId).where("deletedAt", "==", null),
            page
        );
    }

    async summaryByUser(userId: string): Promise<EntitySummaryDTO> {
        const scoped = () =>
            this.ownedBy(userId).where("deletedAt", "==", null);

        const [total, enabled, franchise, customer, collaborator] =
            await Promise.all([
                this.countQuery(scoped()),
                this.countQuery(scoped().where("enabled", "==", true)),
                this.countQuery(
                    scoped().where("type", "==", EntityType.FRANCHISE)
                ),
                this.countQuery(
                    scoped().where("type", "==", EntityType.CUSTOMER)
                ),
                this.countQuery(
                    scoped().where("type", "==", EntityType.COLLABORATOR)
                ),
            ]);

        return {
            total,
            enabled,
            byType: { franchise, customer, collaborator },
        };
    }
}

export const entityRepository = new EntityRepository();
