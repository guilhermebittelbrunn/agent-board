import { parseBoardConfig } from "@repo/kanban-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";

const { listByUserMock } = vi.hoisted(() => ({ listByUserMock: vi.fn() }));

vi.mock("@/(shared)/repositories/runner.repository", () => ({
    runnerRepository: {
        listByUser: (...args: unknown[]) => listByUserMock(...args),
    },
}));

const { chooseExecutorFor, executorsForRuns } = await import(
    "@/(shared)/lib/orchestrator/executor-choice"
);

const NOW = new Date("2026-11-27T05:00:00.000Z");
const onlineRunner = { lastSeenAt: NOW.toISOString(), deletedAt: null };

const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;
if (parsed === undefined) {
    throw new Error("sample board.yml must parse");
}
const config = {
    ...parsed,
    stages: parsed.stages.map((stage) =>
        stage.key === "review"
            ? { ...stage, runners: ["cloud" as const] }
            : stage
    ),
};

const run = (id: string, stageKey: string, userId = "u1") => ({
    id,
    stageKey,
    triggeredBy: { userId, login: userId },
});

beforeEach(() => {
    listByUserMock.mockReset();
    for (const variable of [
        "FIRESTORE_EMULATOR_HOST",
        "FIREBASE_AUTH_EMULATOR_HOST",
        "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
    ]) {
        vi.stubEnv(variable, "");
    }
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("executorsForRuns", () => {
    it("decides per run with its stage and reads each person's runners once", async () => {
        listByUserMock.mockImplementation((userId: string) =>
            Promise.resolve(userId === "u1" ? [onlineRunner] : [])
        );

        const choices = await executorsForRuns(
            [
                run("a", "analyze"),
                run("r", "review"),
                run("s", "spec"),
                run("o", "analyze", "u2"),
            ],
            config,
            NOW
        );

        expect(Object.fromEntries(choices)).toEqual({
            a: { ok: true, executor: "local" },
            r: { ok: false, refusal: "stage_not_served" },
            s: { ok: true, executor: "local" },
            o: { ok: false, refusal: "no_executor" },
        });
        expect(listByUserMock).toHaveBeenCalledTimes(2);
    });
});

describe("chooseExecutorFor", () => {
    it("uses the stage it is given", async () => {
        listByUserMock.mockResolvedValue([onlineRunner]);

        expect(
            await chooseExecutorFor("u1", NOW, { runners: ["cloud"] })
        ).toEqual({ ok: false, refusal: "stage_not_served" });
        expect(await chooseExecutorFor("u1", NOW)).toEqual({
            ok: true,
            executor: "local",
        });
    });
});
