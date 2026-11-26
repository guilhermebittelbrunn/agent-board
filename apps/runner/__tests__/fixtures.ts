import type { RunnerJob } from "@repo/kanban-contract";

export const SECRET_LENGTH = 43;
export const SECRET = "S".repeat(SECRET_LENGTH);
const STAGE_TIMEOUT_MS = 2_700_000;

export const jobFixture = (overrides: Partial<RunnerJob> = {}): RunnerJob => ({
    runId: "run1",
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
    repository: {
        owner: "agent-board-demo",
        name: "sample-app",
        baseBranch: "main",
    },
    install: null,
    deadlineAt: new Date(Date.now() + STAGE_TIMEOUT_MS).toISOString(),
    runToken: `kbr_run1_${SECRET}`,
    ...overrides,
});
