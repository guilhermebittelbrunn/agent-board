import type {
    CardLastRun,
    RunEndReason,
    RunStatus,
    RunTrigger,
    StageConfig,
    StageExecutorKind,
    StageOutcome,
} from "@repo/kanban-contract";
import type { CardDTO } from "./card";

export type CardLastRunDTO = CardLastRun;

export type RunDTO = {
    id: string;
    boardId: string;
    cardId: string;
    stageKey: string;
    command: string;
    model: StageConfig["model"];
    effort: StageConfig["effort"];
    maxTurns: number;
    branch: string;
    trigger: RunTrigger;
    triggeredByLogin: string;
    cycleId: string | null;
    /** `null` while the run waits in the queue; set when an executor takes it. */
    executor: StageExecutorKind | null;
    status: RunStatus;
    outcome: StageOutcome | null;
    endReason: RunEndReason | null;
    queuedAt: string;
    startedAt: string | null;
    deadlineAt: string | null;
    finishedAt: string | null;
};

export type TriggerStageRequest = { stageKey: string };
export type TriggerStageResultDTO = { card: CardDTO; run: RunDTO };

/** `wipLimit: null` runs every card of the stage at once. */
export type BoardStageSettingDTO = {
    wipLimit: number | null;
    approvalGate: boolean;
};
export type BoardStageSettingsDTO = Record<string, BoardStageSettingDTO>;
export type UpdateBoardStageSettingsRequest = { stages: BoardStageSettingsDTO };
