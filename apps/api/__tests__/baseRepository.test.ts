import type { AllOptional } from "@repo/shared/utils";
import { normalizeFirestoreInstant } from "@repo/shared/utils";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Clause = [string, string, unknown];
type Order = [string, string];

const MISSING = Symbol("missing");

const DOCUMENT_ID_FIELD = "__name__";

/** Firestore's canonical value ordering: timestamps sort before strings. */
const VALUE_TYPE_RANK = {
    nullish: 0,
    boolean: 1,
    number: 2,
    instant: 3,
    string: 4,
    other: 5,
} as const;

/**
 * In-memory stand-in for the firebase-admin Firestore surface the repositories rely on.
 * `exists` is deliberately a boolean property (not a method, as in the client SDK) so any
 * leftover client-SDK dialect fails loudly instead of silently returning undefined.
 */
const { fakeDb } = vi.hoisted(() => {
    const collections = new Map<string, Map<string, Record<string, unknown>>>();
    const committedBatchSizes: number[] = [];
    const emittedQueries: {
        table: string;
        clauses: Clause[];
        orders: Order[];
        limit: number | null;
    }[] = [];
    let autoId = 0;

    const table = (name: string) => {
        const existing = collections.get(name);
        if (existing) {
            return existing;
        }
        const created = new Map<string, Record<string, unknown>>();
        collections.set(name, created);
        return created;
    };

    const matches = (row: Record<string, unknown>, clauses: Clause[]) =>
        clauses.every(([field, op, value]) => {
            if (op !== "==") {
                throw new Error(`Unsupported query operator: ${op}`);
            }
            // Firestore does not return documents missing the compared field, not even for null.
            const actual = field in row ? row[field] : MISSING;
            return actual === value;
        });

    /**
     * Firestore sorts by value type before value, which is why a collection holding
     * `createdAt` both as a Timestamp and as an ISO string comes back in an order that is
     * not chronological. The ranks below follow that ordering: timestamps precede strings.
     */
    const typeRank = (value: unknown) => {
        if (value === null || value === undefined) {
            return VALUE_TYPE_RANK.nullish;
        }
        if (typeof value === "boolean") {
            return VALUE_TYPE_RANK.boolean;
        }
        if (typeof value === "number") {
            return VALUE_TYPE_RANK.number;
        }
        if (instantMillis(value) !== null) {
            return VALUE_TYPE_RANK.instant;
        }
        if (typeof value === "string") {
            return VALUE_TYPE_RANK.string;
        }
        return VALUE_TYPE_RANK.other;
    };

    function instantMillis(value: unknown): number | null {
        if (value instanceof Date) {
            return value.getTime();
        }
        if (
            typeof value === "object" &&
            value !== null &&
            typeof (value as { toDate?: unknown }).toDate === "function"
        ) {
            return (value as { toDate: () => Date }).toDate().getTime();
        }
        return null;
    }

    const compareValues = (a: unknown, b: unknown) => {
        const rankDelta = typeRank(a) - typeRank(b);
        if (rankDelta !== 0) {
            return rankDelta;
        }
        const millisA = instantMillis(a);
        if (millisA !== null) {
            return millisA - (instantMillis(b) ?? 0);
        }
        if (typeof a === "number" && typeof b === "number") {
            return a - b;
        }
        if (typeof a === "string" && typeof b === "string") {
            return a.localeCompare(b);
        }
        return 0;
    };

    type Entry = { id: string; row: Record<string, unknown> };

    const orderValue = (entry: Entry, field: string) =>
        field === DOCUMENT_ID_FIELD ? entry.id : entry.row[field];

    const compareEntries = (a: Entry, b: Entry, orders: Order[]) => {
        for (const [field, direction] of orders) {
            const delta = compareValues(
                orderValue(a, field),
                orderValue(b, field)
            );
            if (delta !== 0) {
                return direction === "desc" ? -delta : delta;
            }
        }
        return 0;
    };

    type QueryState = {
        table: string;
        clauses: Clause[];
        orders: Order[];
        limit: number | null;
        after: Entry | null;
    };

    const makeQuery = (state: QueryState) => ({
        where(field: string, op: string, value: unknown) {
            return makeQuery({
                ...state,
                clauses: [...state.clauses, [field, op, value]],
            });
        },
        orderBy(field: unknown, direction = "asc") {
            const path = typeof field === "string" ? field : DOCUMENT_ID_FIELD;
            return makeQuery({
                ...state,
                orders: [...state.orders, [path, direction] as Order],
            });
        },
        limit(count: number) {
            return makeQuery({ ...state, limit: count });
        },
        // The projection only saves bandwidth; the fake hands back whole rows.
        select() {
            return makeQuery(state);
        },
        startAfter(snapshot: { id: string; data: () => Row | undefined }) {
            return makeQuery({
                ...state,
                after: { id: snapshot.id, row: snapshot.data() ?? {} },
            });
        },
        count() {
            const { table: name, clauses } = state;

            return {
                get() {
                    emittedQueries.push({
                        table: name,
                        clauses,
                        orders: [],
                        limit: null,
                    });

                    const matched = [...table(name).values()].filter((row) =>
                        matches(row, clauses)
                    );

                    return Promise.resolve({
                        data: () => ({ count: matched.length }),
                    });
                },
            };
        },
        get() {
            const { table: name, clauses, orders, after } = state;
            const limitTo = state.limit;

            emittedQueries.push({
                table: name,
                clauses,
                orders,
                limit: limitTo,
            });

            let entries: Entry[] = [...table(name).entries()]
                .filter(([, row]) => matches(row, clauses))
                .map(([id, row]) => ({ id, row }));

            if (orders.length > 0) {
                entries.sort((a, b) => compareEntries(a, b, orders));
            }

            if (after) {
                entries = entries.filter(
                    (entry) => compareEntries(entry, after, orders) > 0
                );
            }

            if (limitTo !== null) {
                entries = entries.slice(0, limitTo);
            }

            const docs = entries.map(({ id, row }) => ({
                id,
                ref: { id, table: name },
                exists: true,
                data: () => ({ ...row }),
                get: (field: string) => row[field],
            }));

            return Promise.resolve({ docs, empty: docs.length === 0 });
        },
    });

    const db = {
        batch() {
            const removals: { id: string; table: string }[] = [];
            const patches: {
                ref: { id: string; table: string };
                patch: Row;
            }[] = [];
            return {
                delete(ref: { id: string; table: string }) {
                    removals.push(ref);
                },
                update(ref: { id: string; table: string }, patch: Row) {
                    patches.push({ ref, patch });
                },
                commit() {
                    for (const ref of removals) {
                        table(ref.table).delete(ref.id);
                    }
                    for (const { ref, patch } of patches) {
                        const row = table(ref.table).get(ref.id);
                        table(ref.table).set(ref.id, { ...row, ...patch });
                    }
                    committedBatchSizes.push(removals.length + patches.length);
                    return Promise.resolve([]);
                },
            };
        },
        collection(name: string) {
            return {
                ...makeQuery({
                    table: name,
                    clauses: [],
                    orders: [],
                    limit: null,
                    after: null,
                }),
                doc(id: string) {
                    return {
                        id,
                        get() {
                            const row = table(name).get(id);
                            return Promise.resolve({
                                id,
                                exists: row !== undefined,
                                data: () => (row ? { ...row } : undefined),
                            });
                        },
                        update(patch: Row) {
                            const row = table(name).get(id);
                            if (!row) {
                                return Promise.reject(
                                    new Error(`No document to update: ${id}`)
                                );
                            }
                            table(name).set(id, { ...row, ...patch });
                            return Promise.resolve({});
                        },
                        delete() {
                            table(name).delete(id);
                            return Promise.resolve({});
                        },
                    };
                },
                add(data: Row) {
                    autoId += 1;
                    const id = `doc-${autoId}`;
                    table(name).set(id, { ...data });
                    return Promise.resolve({ id });
                },
            };
        },
        seed(name: string, id: string, row: Row) {
            table(name).set(id, row);
        },
        read(name: string, id: string) {
            return table(name).get(id);
        },
        queries: emittedQueries,
        batches: committedBatchSizes,
        count(name: string) {
            return table(name).size;
        },
        reset() {
            collections.clear();
            emittedQueries.length = 0;
            committedBatchSizes.length = 0;
            autoId = 0;
        },
    };

    return { fakeDb: db };
});

vi.mock("@/(shared)/infra/database", () => ({ default: fakeDb }));

const { BaseRepository, PaginationCursorError, PurgeNotFinishedError } =
    await import("@/(shared)/repositories/base.repository");
const { default: Mapper } = await import("@/(shared)/mappers/Mapper");
const { userRepository } = await import(
    "@/(shared)/repositories/user.repository"
);

/** A collection that exists only here, so the base behavior is tested apart from any resource. */
type WidgetDTO = {
    id: string;
    userId: string;
    name: string;
    description: string;
    size: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

type WidgetRow = Record<string, unknown> & { id: string };

const WIDGET_FIELDS = [
    "userId",
    "name",
    "description",
    "size",
    "enabled",
] as const;

class WidgetMapper extends Mapper<WidgetRow, WidgetDTO> {
    toDTO({ id, ...record }: WidgetRow): WidgetDTO {
        return {
            id,
            userId: String(record.userId ?? ""),
            name: String(record.name ?? ""),
            description: String(record.description ?? ""),
            size: String(record.size ?? ""),
            enabled: Boolean(record.enabled ?? true),
            createdAt: normalizeFirestoreInstant(record.createdAt),
            updatedAt: normalizeFirestoreInstant(record.updatedAt),
            deletedAt:
                record.deletedAt == null
                    ? null
                    : normalizeFirestoreInstant(record.deletedAt),
        };
    }

    toPersistence(
        input: AllOptional<WidgetDTO>
    ): AllOptional<Record<string, unknown>> {
        const out: Record<string, unknown> = {};
        for (const key of WIDGET_FIELDS) {
            if (input[key] !== undefined) {
                out[key] = input[key];
            }
        }
        return out;
    }
}

const widgetMapper = new WidgetMapper();

class WidgetRepository extends BaseRepository<WidgetDTO> {
    listByUser(
        userId: string,
        page: { limit: number; cursorId: string | null }
    ) {
        return this.paginate(
            this.db
                .collection(this.table)
                .where("userId", "==", userId)
                .where("deletedAt", "==", null),
            page
        );
    }
}

const repository = new BaseRepository<WidgetDTO>(
    fakeDb as never,
    "widget",
    widgetMapper
);
const widgetRepository = new WidgetRepository(
    fakeDb as never,
    "widget",
    widgetMapper
);

const CREATED_AT_ISO = "2024-03-01T10:00:00.000Z";
const DOCUMENT_ID_MAX_BYTES = 1500;
const TWO_BYTE_CHAR = "é";

function widgetRow(overrides: Row = {}): Row {
    return {
        userId: "profile-1",
        name: "Acme",
        description: "a widget",
        size: "small",
        enabled: true,
        createdAt: new Date(CREATED_AT_ISO),
        updatedAt: new Date(CREATED_AT_ISO),
        deletedAt: null,
        ...overrides,
    };
}

/** Stand-in for a firebase-admin Timestamp: only `toDate()` is relied upon. */
function adminTimestamp(iso: string) {
    return { toDate: () => new Date(iso) };
}

/**
 * Four rows of the same owner sharing one instant — the shape the emulator seed produces,
 * and the case that repeats or skips records when the cursor has no tie-break.
 */
function seedTiedWidgets() {
    for (const id of ["doc-a", "doc-b", "doc-c", "doc-d"]) {
        fakeDb.seed(
            "widget",
            id,
            widgetRow({ createdAt: adminTimestamp(CREATED_AT_ISO) })
        );
    }
}

beforeEach(() => {
    fakeDb.reset();
});

describe("BaseRepository.findById", () => {
    it("returns null for a document that does not exist", async () => {
        await expect(repository.findById("ghost")).resolves.toBeNull();
    });

    it("returns null for a soft-deleted document", async () => {
        fakeDb.seed(
            "widget",
            "e1",
            widgetRow({ deletedAt: new Date("2024-04-01T00:00:00.000Z") })
        );

        await expect(repository.findById("e1")).resolves.toBeNull();
    });

    it("normalizes a Timestamp-shaped createdAt to an ISO string", async () => {
        fakeDb.seed(
            "widget",
            "e1",
            widgetRow({
                createdAt: adminTimestamp(CREATED_AT_ISO),
                updatedAt: adminTimestamp(CREATED_AT_ISO),
            })
        );

        const found = await repository.findById("e1");

        expect(found?.createdAt).toBe(CREATED_AT_ISO);
        expect(found?.updatedAt).toBe(CREATED_AT_ISO);
    });

    it.each([
        ["a slash", "a/b"],
        ["two slashes", "a/b/c"],
        ["a reserved name", "__reserved__"],
        ["a single dot", "."],
        ["a double dot", ".."],
        ["ASCII over 1500 bytes", "x".repeat(DOCUMENT_ID_MAX_BYTES + 1)],
        [
            "two-byte characters over 1500 bytes",
            TWO_BYTE_CHAR.repeat(DOCUMENT_ID_MAX_BYTES / 2 + 1),
        ],
    ])(
        "returns null without touching Firestore for an id with %s",
        async (_label, id) => {
            const collectionSpy = vi.spyOn(fakeDb, "collection");

            try {
                await expect(repository.findById(id)).resolves.toBeNull();
                expect(collectionSpy).not.toHaveBeenCalled();
            } finally {
                collectionSpy.mockRestore();
            }
        }
    );

    it("still reads an id of exactly 1500 bytes", async () => {
        const collectionSpy = vi.spyOn(fakeDb, "collection");

        try {
            await expect(
                repository.findById(
                    TWO_BYTE_CHAR.repeat(DOCUMENT_ID_MAX_BYTES / 2)
                )
            ).resolves.toBeNull();
            expect(collectionSpy).toHaveBeenCalledWith("widget");
        } finally {
            collectionSpy.mockRestore();
        }
    });

    it("keeps an already-ISO createdAt untouched", async () => {
        fakeDb.seed(
            "widget",
            "e1",
            widgetRow({ createdAt: CREATED_AT_ISO, updatedAt: CREATED_AT_ISO })
        );

        const found = await repository.findById("e1");

        expect(found?.createdAt).toBe(CREATED_AT_ISO);
        expect(found?.id).toBe("e1");
    });
});

describe("BaseRepository.findAll", () => {
    it("queries only documents whose deletedAt is null", async () => {
        fakeDb.seed("widget", "kept", widgetRow());
        fakeDb.seed(
            "widget",
            "gone",
            widgetRow({ deletedAt: new Date("2024-04-01T00:00:00.000Z") })
        );

        const rows = await repository.findAll();

        expect(rows.map((row) => row.id)).toEqual(["kept"]);
        expect(fakeDb.queries.at(-1)).toEqual({
            table: "widget",
            clauses: [["deletedAt", "==", null]],
            orders: [],
            limit: null,
        });
    });

    it("applies the row mapper, like findById does", async () => {
        fakeDb.seed(
            "widget",
            "kept",
            widgetRow({ createdAt: adminTimestamp(CREATED_AT_ISO) })
        );

        const [row] = await repository.findAll();

        expect(row.createdAt).toBe(CREATED_AT_ISO);
    });

    it("falls back to the raw row when the repository has no mapper", async () => {
        const unmapped = new BaseRepository<WidgetDTO>(
            fakeDb as never,
            "widget"
        );
        fakeDb.seed("widget", "kept", widgetRow({ createdAt: CREATED_AT_ISO }));

        const [row] = await unmapped.findAll();

        expect(row).toMatchObject({ id: "kept", createdAt: CREATED_AT_ISO });
    });
});

describe("BaseRepository.create", () => {
    it("stamps the timestamps, clears deletedAt and returns a mapped DTO", async () => {
        const created = await repository.create({
            userId: "profile-1",
            name: "Acme",
            description: "a widget",
            size: "small",
            enabled: true,
        });

        expect(created.id).toBe("doc-1");
        expect(created.deletedAt).toBeNull();
        expect(new Date(created.createdAt).getTime()).not.toBeNaN();
        expect(created.updatedAt).toBe(created.createdAt);

        const stored = fakeDb.read("widget", "doc-1");
        expect(stored?.deletedAt).toBeNull();
        expect(stored?.createdAt).toBeInstanceOf(Date);
    });
});

describe("BaseRepository.update and delete", () => {
    it("returns the id and refreshes updatedAt", async () => {
        fakeDb.seed("widget", "e1", widgetRow());

        const id = await repository.update({ id: "e1", name: "Renamed" });

        expect(id).toBe("e1");
        const stored = fakeDb.read("widget", "e1");
        expect(stored?.name).toBe("Renamed");
        expect(stored?.updatedAt).toBeInstanceOf(Date);
    });

    it("leaves createdAt in the stored type instead of writing the mapped string back", async () => {
        const storedInstant = adminTimestamp(CREATED_AT_ISO);
        fakeDb.seed("widget", "e1", widgetRow({ createdAt: storedInstant }));

        await repository.update({ id: "e1", name: "Renamed" });
        await repository.update({ id: "e1", name: "Renamed again" });

        expect(fakeDb.read("widget", "e1")?.createdAt).toBe(storedInstant);
    });

    it("writes only the fields it was given", async () => {
        fakeDb.seed("widget", "e1", widgetRow());

        await repository.update({ id: "e1", name: "Renamed" });

        const stored = fakeDb.read("widget", "e1");
        expect(stored?.name).toBe("Renamed");
        expect(stored?.description).toBe("a widget");
    });

    it("soft-deletes instead of removing the document", async () => {
        fakeDb.seed("widget", "e1", widgetRow());

        await repository.delete("e1");

        const stored = fakeDb.read("widget", "e1");
        expect(stored).toBeDefined();
        expect(stored?.deletedAt).toBeInstanceOf(Date);
        await expect(repository.findById("e1")).resolves.toBeNull();
    });
});

describe("BaseRepository.paginate", () => {
    const firstPage = { limit: 20, cursorId: null };

    it("scopes by owner, drops soft-deleted rows and sorts by createdAt desc", async () => {
        fakeDb.seed(
            "widget",
            "older",
            widgetRow({ createdAt: adminTimestamp("2024-01-01T00:00:00.000Z") })
        );
        fakeDb.seed(
            "widget",
            "newer",
            widgetRow({ createdAt: adminTimestamp("2024-06-01T00:00:00.000Z") })
        );
        fakeDb.seed(
            "widget",
            "removed",
            widgetRow({ deletedAt: new Date("2024-07-01T00:00:00.000Z") })
        );
        fakeDb.seed(
            "widget",
            "someone-else",
            widgetRow({
                userId: "profile-2",
                createdAt: adminTimestamp("2024-03-01T00:00:00.000Z"),
            })
        );

        const page = await widgetRepository.listByUser("profile-1", firstPage);

        expect(page.items.map((row) => row.id)).toEqual(["newer", "older"]);
        expect(page.nextCursorId).toBeNull();
    });

    it("pushes the soft-delete filter, the ordering and the size into the query", async () => {
        fakeDb.seed("widget", "kept", widgetRow());

        await widgetRepository.listByUser("profile-1", {
            limit: 2,
            cursorId: null,
        });

        expect(fakeDb.queries.at(-1)).toEqual({
            table: "widget",
            clauses: [
                ["userId", "==", "profile-1"],
                ["deletedAt", "==", null],
            ],
            orders: [
                ["createdAt", "desc"],
                [DOCUMENT_ID_FIELD, "desc"],
            ],
            // One more than asked, which is how the page learns there is a next one
            // without counting the collection.
            limit: 3,
        });
    });

    it("hands back the requested size plus a cursor when more rows exist", async () => {
        seedTiedWidgets();

        const page = await widgetRepository.listByUser("profile-1", {
            limit: 2,
            cursorId: null,
        });

        expect(page.items.map((row) => row.id)).toEqual(["doc-d", "doc-c"]);
        expect(page.nextCursorId).toBe("doc-c");
    });

    it("walks every row exactly once when createdAt is identical across the page break", async () => {
        seedTiedWidgets();

        const first = await widgetRepository.listByUser("profile-1", {
            limit: 2,
            cursorId: null,
        });
        const second = await widgetRepository.listByUser("profile-1", {
            limit: 2,
            cursorId: first.nextCursorId,
        });

        expect([...first.items, ...second.items].map((row) => row.id)).toEqual([
            "doc-d",
            "doc-c",
            "doc-b",
            "doc-a",
        ]);
        expect(second.nextCursorId).toBeNull();
    });

    it("keeps anchoring on a row that was soft-deleted after the page was served", async () => {
        seedTiedWidgets();
        fakeDb.seed(
            "widget",
            "doc-c",
            widgetRow({
                createdAt: adminTimestamp(CREATED_AT_ISO),
                deletedAt: new Date("2024-07-01T00:00:00.000Z"),
            })
        );

        const page = await widgetRepository.listByUser("profile-1", {
            limit: 2,
            cursorId: "doc-c",
        });

        expect(page.items.map((row) => row.id)).toEqual(["doc-b", "doc-a"]);
    });

    it("refuses a cursor whose anchor is not there", async () => {
        seedTiedWidgets();

        await expect(
            widgetRepository.listByUser("profile-1", {
                limit: 2,
                cursorId: "never-existed",
            })
        ).rejects.toBeInstanceOf(PaginationCursorError);
    });

    it("never returns someone else's rows when the cursor points at their document", async () => {
        seedTiedWidgets();
        fakeDb.seed(
            "widget",
            "doc-intruder",
            widgetRow({
                createdAt: adminTimestamp(CREATED_AT_ISO),
                userId: "profile-2",
            })
        );

        const page = await widgetRepository.listByUser("profile-1", {
            limit: 20,
            cursorId: "doc-intruder",
        });

        expect(page.items.map((row) => row.id)).toEqual([
            "doc-d",
            "doc-c",
            "doc-b",
            "doc-a",
        ]);
        expect(page.items.every((row) => row.userId === "profile-1")).toBe(
            true
        );
    });
});

describe("UserRepository.findByReferenceId", () => {
    it("emits both equality filters and returns the profile", async () => {
        fakeDb.seed("user", "p1", {
            reference_id: "auth-uid-1",
            type: "common",
            deletedAt: null,
        });

        const profile = await userRepository.findByReferenceId("auth-uid-1");

        expect(profile?.id).toBe("p1");
        expect(fakeDb.queries.at(-1)).toEqual({
            table: "user",
            clauses: [
                ["reference_id", "==", "auth-uid-1"],
                ["deletedAt", "==", null],
            ],
            orders: [],
            limit: null,
        });
    });

    it("returns null when no profile matches", async () => {
        await expect(
            userRepository.findByReferenceId("auth-uid-missing")
        ).resolves.toBeNull();
    });
});

describe("UserRepository.update and delete", () => {
    function seedProfile() {
        fakeDb.seed("user", "p1", {
            reference_id: "auth-1",
            createdAt: Timestamp.fromDate(new Date(CREATED_AT_ISO)),
            updatedAt: Timestamp.fromDate(new Date(CREATED_AT_ISO)),
            deletedAt: null,
        });
    }

    it("keeps createdAt a Timestamp, since the repository has no mapper", async () => {
        seedProfile();

        await userRepository.update({ id: "p1", phone: "+5511999990000" });

        const stored = fakeDb.read("user", "p1");
        expect(stored?.phone).toBe("+5511999990000");
        expect(stored?.createdAt).toBeInstanceOf(Timestamp);
        expect(stored?.updatedAt).toBeInstanceOf(Date);
    });

    it("soft-deletes the profile instead of removing the document", async () => {
        seedProfile();

        await userRepository.delete("p1");

        expect(fakeDb.read("user", "p1")?.deletedAt).toBeInstanceOf(Date);
        await expect(userRepository.findById("p1")).resolves.toBeNull();
        await expect(
            userRepository.findByReferenceId("auth-1")
        ).resolves.toBeNull();
    });
});

/** Exposes the protected sweep so the bounded loop can be exercised directly. */
class PurgeableRepository extends BaseRepository<WidgetDTO> {
    purgeEverything(): Promise<number> {
        return this.purgeAll(
            this.db.collection(this.table) as unknown as Parameters<
                PurgeableRepository["purgeAll"]
            >[0]
        );
    }
}

/**
 * A collection whose batch deletes never take effect, so every pass reads a full page
 * again. It is the shape of a sweep that would spin forever without a pass ceiling.
 */
function undrainableDb() {
    const PAGE = 500;
    const state = { committedBatches: 0 };

    const page = Array.from({ length: PAGE }, (_, index) => ({
        id: `stuck-${index}`,
        ref: { id: `stuck-${index}` },
        exists: true,
        data: () => ({}),
    }));

    const query = {
        where: () => query,
        orderBy: () => query,
        startAfter: () => query,
        limit: () => query,
        get: () => Promise.resolve({ docs: page, empty: false }),
    };

    const db = {
        collection: () => query,
        batch: () => ({
            delete: () => {
                // Nothing leaves the collection, on purpose.
            },
            commit: () => {
                state.committedBatches += 1;
                return Promise.resolve([]);
            },
        }),
    };

    return {
        db,
        get committedBatches() {
            return state.committedBatches;
        },
    };
}

describe("purge vs. delete", () => {
    const BATCH_LIMIT = 500;

    it("keeps `delete` a soft delete, stamping instead of removing", async () => {
        fakeDb.seed("widget", "e1", widgetRow());

        await repository.delete("e1");

        expect(fakeDb.read("widget", "e1")).toBeDefined();
        expect(fakeDb.read("widget", "e1")?.deletedAt).toBeInstanceOf(Date);
    });

    it("drains the collection in batches of 500", async () => {
        for (let index = 0; index < BATCH_LIMIT + 1; index++) {
            fakeDb.seed("widget", `e${index}`, widgetRow());
        }

        const removed = await new PurgeableRepository(
            fakeDb as never,
            "widget"
        ).purgeEverything();

        expect(removed).toBe(BATCH_LIMIT + 1);
        expect(fakeDb.batches).toEqual([BATCH_LIMIT, 1]);
        expect(fakeDb.count("widget")).toBe(0);
    });

    it("stops and reports instead of looping when the query never drains", async () => {
        const MAX_PASSES = 100;
        const undrainable = undrainableDb();
        const repositoryOverUndrainable = new PurgeableRepository(
            undrainable.db as never,
            "widget"
        );

        await expect(
            repositoryOverUndrainable.purgeEverything()
        ).rejects.toBeInstanceOf(PurgeNotFinishedError);
        expect(undrainable.committedBatches).toBe(MAX_PASSES);
    });
});
