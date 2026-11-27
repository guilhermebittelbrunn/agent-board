import { z } from "zod";
import type { StageConfig } from "./boardConfig";

export const RUNNER_TOKEN_PREFIX = "kbl_";
const MINUTE_MS = 60_000;
const CODE_TTL_MINUTES = 10;
const CLAIM_GRACE_MINUTES = 2;
const MAX_TYPED_CODE_LENGTH = 32;

export const RUNNER_CODE_TTL_MS = CODE_TTL_MINUTES * MINUTE_MS;
/** A runner polls every 10 s by default, so a minute without contact means it is gone. */
export const RUNNER_ONLINE_WINDOW_MS = 60_000;
/** How long a local run may wait for its runner before it ends with `no_runner`. */
export const RUNNER_CLAIM_GRACE_MS = CLAIM_GRACE_MINUTES * MINUTE_MS;
/** `lastSeenAt` is written at most this often, so polling does not cost one write per call. */
export const RUNNER_SEEN_WRITE_INTERVAL_MS = 30_000;

/** Crockford base32 without the letters that read like digits (I, L, O, U). */
export const RUNNER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RUNNER_CODE_LENGTH = 8;
const RUNNER_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export const RUNNER_NAME = /^[A-Za-z0-9._-]{1,40}$/;
const SESSION_ID = /^[A-Za-z0-9-]{1,64}$/;

const RUNNER_SHORT_ID_LENGTH = 6;

/**
 * How a runner is told apart where people see it: the board's runner list, the card notes and
 * the runner's own terminal. Two runners of the same machine share the host name.
 */
export const shortRunnerId = (runnerId: string): string =>
    runnerId.slice(0, RUNNER_SHORT_ID_LENGTH);

export const normalizeRunnerCode = (code: string): string =>
    code.replaceAll("-", "").trim().toUpperCase();

/** `KQ7M4XPD` → `KQ7M-4XPD`, the way the board shows it. */
export const formatRunnerCode = (code: string): string =>
    `${code.slice(0, RUNNER_CODE_LENGTH / 2)}-${code.slice(RUNNER_CODE_LENGTH / 2)}`;

export const runnerRegisterSchema = z.object({
    code: z
        .string()
        .max(MAX_TYPED_CODE_LENGTH)
        .transform(normalizeRunnerCode)
        .pipe(z.string().regex(RUNNER_CODE)),
    name: z.string().regex(RUNNER_NAME),
});
export type RunnerRegisterInput = z.infer<typeof runnerRegisterSchema>;

export const RUNNER_EXITS = [
    "exited",
    "interrupted",
    "turn_limit",
    "deadline",
    "stopped",
    "error",
] as const;
export type RunnerExit = (typeof RUNNER_EXITS)[number];

export const runnerHeartbeatSchema = z.object({
    turns: z.number().int().min(0),
});
export type RunnerHeartbeatInput = z.infer<typeof runnerHeartbeatSchema>;

export const runnerFinishSchema = z.object({
    turns: z.number().int().min(0),
    durationMs: z.number().int().min(0),
    exit: z.enum(RUNNER_EXITS),
    sessionId: z.string().regex(SESSION_ID).optional(),
});
export type RunnerFinishInput = z.infer<typeof runnerFinishSchema>;

/**
 * What a runner receives when it claims a run. Only the fields the session needs to start:
 * the spec, answers and comments reach the agent through `get_card`, as data.
 */
export type RunnerJob = {
    runId: string;
    boardId: string;
    cardId: string;
    slug: string;
    stageKey: string;
    command: string;
    agent: string | null;
    model: StageConfig["model"];
    effort: StageConfig["effort"];
    maxTurns: number;
    branch: string;
    repository: { owner: string; name: string; baseBranch: string };
    install: string | null;
    deadlineAt: string;
    runToken: string;
    cycleId: string | null;
};

export type RunnerRegisterResult = {
    runnerId: string;
    name: string;
    token: string;
};
export type RunnerClaimResult = { job: RunnerJob | null };
export type RunnerHeartbeatResult = { active: boolean };
export type RunnerFinishResult = { recorded: boolean };
