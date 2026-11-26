import { type BoardConfig, parseBoardConfig } from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import { type BacklogSpec, planBacklogSync } from "@/(shared)/lib/card-sync";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import { type CardRecord, cardMapper } from "@/(shared)/mappers/card.mapper";

const BOARD_ID = "agent-board-demo--sample-app";
const NOW = new Date("2026-11-26T12:00:00.000Z");
const config = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data as BoardConfig;

const spec = (
    id: string,
    overrides: Partial<BacklogSpec> = {}
): BacklogSpec => ({
    path: `specs/features/${id}.md`,
    sha: `sha-${id}`,
    id,
    title: id,
    status: "approved",
    ...overrides,
});

const card = (
    slug: string,
    overrides: Record<string, unknown> = {}
): CardRecord =>
    cardMapper.toDTO({
        id: `${BOARD_ID}__${slug}`,
        boardId: BOARD_ID,
        slug,
        title: slug,
        spec: {
            path: `specs/features/${slug}.md`,
            sha: `sha-${slug}`,
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
        syncedAt: "2026-11-25T10:00:00.000Z",
        createdAt: "2026-11-25T10:00:00.000Z",
        updatedAt: "2026-11-25T10:00:00.000Z",
        deletedAt: null,
        ...overrides,
    });

const plan = (
    existing: CardRecord[],
    specs: BacklogSpec[],
    boardConfig = config
) =>
    planBacklogSync({
        boardId: BOARD_ID,
        existing,
        specs,
        config: boardConfig,
        now: NOW,
    });

const created = (result: ReturnType<typeof plan>) =>
    result.writes.flatMap((write) =>
        write.kind === "create" ? [write.document] : []
    );

describe("planBacklogSync", () => {
    it("creates the first cards in the order of the index", () => {
        const result = plan(
            [],
            [spec("a"), spec("b", { status: "proposed" }), spec("c")]
        );

        expect(
            created(result).map((doc) => [doc.slug, doc.order, doc.ready])
        ).toEqual([
            ["a", 0, true],
            ["b", 1, false],
            ["c", 2, true],
        ]);
        expect(created(result)[0]).toMatchObject({
            lane: "tasks",
            stageKey: null,
            state: "idle",
            reworkLoops: 0,
            branch: "feat/a",
            orphan: false,
            syncedAt: NOW,
        });
        expect(result.summary).toEqual({
            created: 3,
            updated: 0,
            orphaned: 0,
            unchanged: 0,
        });
        expect(result.specCount).toBe(created(result).length);
    });

    it("puts a new spec at the end of Tasks and keeps the board's order", () => {
        const existing = [card("a", { order: 1 }), card("b", { order: 0 })];

        const result = plan(existing, [spec("a"), spec("b"), spec("new")]);

        expect(created(result)).toEqual([
            expect.objectContaining({ slug: "new", order: 2 }),
        ]);
        expect(result.writes.some((write) => write.kind === "update")).toBe(
            false
        );
        expect(result.summary).toMatchObject({ created: 1, unchanged: 2 });
    });

    it("updates the status and readiness without touching the order", () => {
        const result = plan(
            [card("a", { order: 4 })],
            [spec("a", { status: "proposed", sha: "new" })]
        );

        expect(result.writes).toEqual([
            {
                kind: "update",
                id: `${BOARD_ID}__a`,
                patch: expect.objectContaining({
                    ready: false,
                    spec: {
                        path: "specs/features/a.md",
                        sha: "new",
                        status: "proposed",
                    },
                }),
            },
        ]);
        const write = result.writes[0];
        expect(write?.kind === "update" && "order" in write.patch).toBe(false);
    });

    it("marks a card orphan when its spec left the index, and brings it back later", () => {
        const orphaned = plan([card("gone")], []);

        expect(orphaned.writes).toEqual([
            {
                kind: "update",
                id: `${BOARD_ID}__gone`,
                patch: expect.objectContaining({ orphan: true, ready: false }),
            },
        ]);
        expect(orphaned.summary.orphaned).toBe(1);

        const back = plan(
            [card("gone", { orphan: true, ready: false })],
            [spec("gone")]
        );
        expect(back.writes[0]).toMatchObject({
            kind: "update",
            patch: { orphan: false, ready: true },
        });
    });

    it("never writes state, lane or stage key of an existing card", () => {
        const result = plan(
            [
                card("a", {
                    lane: "stage",
                    stageKey: "analyze",
                    state: "running",
                }),
            ],
            [spec("a", { title: "New title" })]
        );
        const write = result.writes[0];

        expect(write?.kind).toBe("update");
        if (write?.kind === "update") {
            expect(write.patch).not.toHaveProperty("lane");
            expect(write.patch).not.toHaveProperty("stageKey");
            expect(write.patch).not.toHaveProperty("state");
        }
    });

    it("recomputes the branch only while the card is in Tasks", () => {
        const renamed = { ...config, branchPattern: "spec/{slug}" };

        const inTasks = plan([card("a")], [spec("a")], renamed);
        const started = plan(
            [card("a", { lane: "stage", stageKey: "develop" })],
            [spec("a")],
            renamed
        );

        expect(inTasks.writes[0]).toMatchObject({
            patch: { branch: "spec/a" },
        });
        expect(started.writes).toEqual([]);
    });

    it("skips an invalid slug and a repeated one, keeping the first", () => {
        const result = plan(
            [],
            [
                spec("a"),
                spec("Not A Slug", { path: "specs/features/bad.md" }),
                spec("a", { path: "specs/features/a-copy.md" }),
            ]
        );

        expect(result.skipped).toEqual([
            { path: "specs/features/bad.md", reason: "slug_invalid" },
            { path: "specs/features/a-copy.md", reason: "slug_duplicated" },
        ]);
        expect(created(result)).toHaveLength(1);
        expect(created(result)[0]).toMatchObject({
            spec: { path: "specs/features/a.md" },
        });
    });

    it("skips the slugs taken by the sync and order routes", () => {
        const result = plan(
            [],
            [spec("sync"), spec("order"), spec("sync-backlog")]
        );

        expect(result.skipped).toEqual([
            { path: "specs/features/sync.md", reason: "slug_invalid" },
            { path: "specs/features/order.md", reason: "slug_invalid" },
        ]);
        expect(created(result).map((doc) => doc.slug)).toEqual([
            "sync-backlog",
        ]);
    });

    it("finds a delivered spec by its new path instead of orphaning it", () => {
        const result = plan(
            [card("fork-cleanup", { lane: "done" })],
            [
                spec("fork-cleanup", {
                    path: "docs/features/fork-cleanup/spec.md",
                    status: "done",
                }),
            ]
        );

        expect(result.summary.orphaned).toBe(0);
        expect(result.writes[0]).toMatchObject({
            patch: {
                orphan: false,
                spec: {
                    path: "docs/features/fork-cleanup/spec.md",
                    status: "done",
                },
            },
        });
    });

    it("leaves the branch empty when the pattern would hit a protected branch", () => {
        const result = plan([], [spec("main")], {
            ...config,
            branchPattern: "{slug}",
        });

        expect(created(result)[0]).toMatchObject({ branch: null });
    });
});
