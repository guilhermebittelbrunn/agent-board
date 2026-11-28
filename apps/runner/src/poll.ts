import { setTimeout as sleep } from "node:timers/promises";
import { isUnauthorized, type RunnerApi } from "./api.ts";
import { type JobContext, runJob } from "./run-job.ts";

const MAX_BACKOFF_MS = 60_000;
const MS_PER_SECOND = 1000;

export type PollOptions = Omit<JobContext, "signal"> & {
    api: RunnerApi;
    pollIntervalMs: number;
    /** Ends polling; a run in progress is stopped and reported as interrupted. */
    signal: AbortSignal;
};

export type PollEnd =
    | { reason: "stopped" }
    | { reason: "refused"; code: string };

const wait = (ms: number, signal: AbortSignal) =>
    sleep(ms, undefined, { signal }).catch(() => null);

/** Polls the board for work, one run at a time, until stopped or refused by the API. */
export async function pollForWork(options: PollOptions): Promise<PollEnd> {
    let failures = 0;
    while (!options.signal.aborted) {
        let job: Awaited<ReturnType<RunnerApi["claim"]>>["job"];
        try {
            job = (await options.api.claim()).job;
            failures = 0;
        } catch (error) {
            if (isUnauthorized(error)) {
                return {
                    reason: "refused",
                    code: error.code ?? "RUNNER_TOKEN_INVALID",
                };
            }
            failures += 1;
            const backoff = Math.min(
                MAX_BACKOFF_MS,
                options.pollIntervalMs * 2 ** failures
            );
            options.log(
                `board fora do ar (${(error as Error).message}); nova tentativa em ${Math.round(backoff / MS_PER_SECOND)} s`
            );
            await wait(backoff, options.signal);
            continue;
        }
        if (job === null) {
            await wait(options.pollIntervalMs, options.signal);
            continue;
        }
        options.log(
            `pegou ${job.command} ${job.slug} · etapa ${job.stageKey} · branch ${job.branch} · ${job.model}/${job.effort} · até ${job.maxTurns} turnos · run ${job.runId}`
        );
        const result = await runJob(job, options);
        if (result.revoked) {
            return { reason: "refused", code: "RUNNER_REVOKED" };
        }
    }
    return { reason: "stopped" };
}
