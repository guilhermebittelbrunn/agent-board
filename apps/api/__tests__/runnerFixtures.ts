import type { RunRecord } from "@/(shared)/mappers/run.mapper";
import type { RunnerRecord } from "@/(shared)/mappers/runner.mapper";

export const NOW = new Date("2026-11-26T10:00:00.000Z");

export const SECOND_MS = 1000;
export const RECENT_MS = 5000;
export const HALF_MINUTE_MS = 30_000;
export const MINUTE_MS = 60_000;
export const TWO_MINUTES_MS = 120_000;
export const TEN_MINUTES_MS = 600_000;
export const STAGE_TIMEOUT_MS = 2_700_000;
export const DAY_MS = 86_400_000;
export const TOKEN_SECRET_LENGTH = 43;

export const isoBefore = (ms: number): string =>
    new Date(NOW.getTime() - ms).toISOString();

export const isoAfter = (ms: number): string =>
    new Date(NOW.getTime() + ms).toISOString();

export const runFixture = (overrides: Partial<RunRecord> = {}): RunRecord => ({
    id: "run1",
    boardId: "agent-board-demo--sample-app",
    cardId: "agent-board-demo--sample-app__search-cards",
    slug: "search-cards",
    stageKey: "analyze",
    command: "/analyze",
    agent: "planejador-tarefa",
    model: "opus",
    effort: "high",
    maxTurns: 200,
    branch: "feat/search-cards",
    trigger: "drag",
    triggeredBy: { userId: "u1", login: "octo" },
    cycleId: null,
    executor: "local",
    status: "running",
    active: true,
    outcome: null,
    endReason: null,
    stoppedBy: null,
    queuedAt: isoBefore(MINUTE_MS),
    startedAt: isoBefore(HALF_MINUTE_MS),
    deadlineAt: isoAfter(STAGE_TIMEOUT_MS),
    finishedAt: null,
    sessionUrl: null,
    turns: null,
    runnerId: null,
    claimedAt: null,
    runnerFinishedAt: null,
    createdAt: isoBefore(MINUTE_MS),
    updatedAt: isoBefore(HALF_MINUTE_MS),
    deletedAt: null,
    ...overrides,
});

export const runnerFixture = (
    overrides: Partial<RunnerRecord> = {}
): RunnerRecord => ({
    id: "runnerA",
    userId: "u1",
    name: "macbook",
    tokenLast4: "7f2c",
    lastSeenAt: isoBefore(RECENT_MS),
    currentRunId: null,
    createdAt: isoBefore(DAY_MS),
    updatedAt: isoBefore(RECENT_MS),
    deletedAt: null,
    ...overrides,
});
