import { parseBoardConfig } from "@repo/kanban-contract";
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import { boardMapper } from "@/(shared)/mappers/board.mapper";

const CREATED = "2026-11-25T14:02:00.000Z";
const REPOSITORY = {
    installationId: 1,
    owner: "agent-board-demo",
    name: "sample-app",
    fullName: "agent-board-demo/sample-app",
    defaultBranch: "main",
    private: false,
};
const config = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;

describe("boardMapper.toDTO", () => {
    it("turns Firestore instants into ISO, the read instant included", () => {
        const at = Timestamp.fromDate(new Date(CREATED));
        const dto = boardMapper.toDTO({
            id: "agent-board-demo--sample-app",
            ownerUserId: "p1",
            ownerGithubId: "42",
            name: "sample-app",
            repository: REPOSITORY,
            config,
            configSource: {
                path: ".kanban/board.yml",
                ref: "main",
                sha: "abc",
                readAt: at,
            },
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
        });

        expect(dto).toEqual({
            id: "agent-board-demo--sample-app",
            ownerUserId: "p1",
            ownerGithubId: "42",
            name: "sample-app",
            repository: REPOSITORY,
            config,
            configSource: {
                path: ".kanban/board.yml",
                ref: "main",
                sha: "abc",
                readAt: CREATED,
            },
            backlogSync: null,
            stageSettings: {},
            createdAt: CREATED,
            updatedAt: CREATED,
            deletedAt: null,
        });
    });
});

describe("boardMapper.toDTO backlogSync", () => {
    it("turns the last sync instant into ISO", () => {
        const dto = boardMapper.toDTO({
            id: "b",
            backlogSync: {
                indexPath: "specs/BACKLOG.md",
                indexSha: "abc",
                ref: "main",
                syncedAt: Timestamp.fromDate(new Date(CREATED)),
                specCount: 5,
            },
        });

        expect(dto.backlogSync).toEqual({
            indexPath: "specs/BACKLOG.md",
            indexSha: "abc",
            ref: "main",
            syncedAt: CREATED,
            specCount: 5,
        });
    });

    it("never writes backlogSync through toPersistence", () => {
        expect(
            boardMapper.toPersistence({
                name: "x",
                backlogSync: { specCount: 1 },
            } as never)
        ).toEqual({ name: "x" });
    });
});

describe("boardMapper.toPersistence", () => {
    it("keeps only the persisted keys", () => {
        const out = boardMapper.toPersistence({
            name: "x",
            id: "forged",
            createdAt: "2020-01-01T00:00:00.000Z",
        } as never);

        expect(out).toEqual({ name: "x" });
    });

    it("drops undefined keys at any depth, since Firestore refuses them", () => {
        const withHoles = {
            ...config,
            stages: config?.stages.map((stage) => ({
                onRework: undefined,
                ...stage,
            })),
            environment: { install: undefined },
        };

        const out = boardMapper.toPersistence({
            config: withHoles,
        } as never) as {
            config: { stages: Record<string, unknown>[] };
        };

        const hasUndefined = (value: unknown): boolean =>
            value === undefined ||
            (value !== null &&
                typeof value === "object" &&
                Object.values(value).some(hasUndefined));
        expect(hasUndefined(out)).toBe(false);
        expect(Object.hasOwn(out.config.stages[0] ?? {}, "onRework")).toBe(
            false
        );
        expect(out.config.stages[2]?.onRework).toBe("develop");
    });

    it("keeps a Date as a Date so Firestore stores a timestamp", () => {
        const readAt = new Date(CREATED);
        const out = boardMapper.toPersistence({
            configSource: { path: "p", ref: "main", sha: "s", readAt },
        }) as { configSource: { readAt: unknown } };

        expect(out.configSource.readAt).toBe(readAt);
    });
});
