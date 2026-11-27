import { z } from "zod";
import {
    type BoardConfig,
    type RunnerKind,
    SPEC_STAGE_KEY,
    type StageConfig,
} from "./boardConfig";
import type { StageExecutorKind } from "./run";

export const CREDENTIAL_KINDS = ["local_runner", "scheduled_task"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_CHECK_STATUSES = ["ok", "rejected"] as const;
export type CredentialCheckStatus = (typeof CREDENTIAL_CHECK_STATUSES)[number];

const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 512;
const MAX_FIRE_URL_LENGTH = 200;

// The board POSTs the token to this URL, so accepting any other host would let a member aim the API anywhere.
export const SCHEDULED_TASK_FIRE_URL =
    /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/(trig_[A-Za-z0-9]+)\/fire$/;

export const scheduledTaskInputSchema = z.object({
    fireUrl: z
        .string()
        .trim()
        .max(MAX_FIRE_URL_LENGTH)
        .regex(SCHEDULED_TASK_FIRE_URL),
    token: z.string().trim().min(MIN_TOKEN_LENGTH).max(MAX_TOKEN_LENGTH),
});
export type ScheduledTaskInput = z.infer<typeof scheduledTaskInputSchema>;

export function scheduledTaskIdOf(fireUrl: string): string | null {
    return SCHEDULED_TASK_FIRE_URL.exec(fireUrl.trim())?.[1] ?? null;
}

export function stageAcceptsRunner(
    stage: Pick<StageConfig, "runners">,
    kind: RunnerKind
): boolean {
    return stage.runners.includes(kind);
}

/** The runners a stage of the board accepts, the spec stage included; `undefined` for an unknown key. */
export function stageRunnersOf(
    config: Pick<BoardConfig, "stages" | "specAuthoring">,
    stageKey: string
): Pick<StageConfig, "runners"> | undefined {
    if (stageKey === SPEC_STAGE_KEY) {
        return config.specAuthoring;
    }
    return config.stages.find((stage) => stage.key === stageKey);
}

export type StageExecutorRefusal = "no_executor" | "stage_not_served";

export type StageExecutorChoice =
    | { ok: true; executor: StageExecutorKind }
    | { ok: false; refusal: StageExecutorRefusal };

/**
 * `no_executor` means the person could be served by bringing a runner online; `stage_not_served` means
 * nothing they own today can run this stage, because the stage does not accept the local runner.
 */
export function chooseStageExecutor(input: {
    stageRunners: readonly RunnerKind[];
    hasOnlineRunner: boolean;
    emulated: boolean;
}): StageExecutorChoice {
    const acceptsLocal = input.stageRunners.includes("local");
    if (acceptsLocal && input.hasOnlineRunner) {
        return { ok: true, executor: "local" };
    }
    const fakeServes = acceptsLocal || input.stageRunners.includes("cloud");
    if (input.emulated && fakeServes) {
        return { ok: true, executor: "fake" };
    }
    return {
        ok: false,
        refusal: acceptsLocal ? "no_executor" : "stage_not_served",
    };
}
