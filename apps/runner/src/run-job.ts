import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunnerExit, RunnerJob } from "@repo/kanban-contract";
import { createActivityLog } from "./activity.ts";
import { ApiError, type RunnerApi } from "./api.ts";
import { ensurePrivateDir, runnerPaths } from "./config.ts";
import {
    fetchOrigin,
    removeWorktreePlan,
    repositoryUrl,
    runGit,
    runGitSteps,
    worktreePlan,
} from "./git.ts";
import { isSafeJob } from "./job.ts";
import {
    type Leftover,
    releaseBranchWorktrees,
    sweepLeftoverRuns,
    writeAgentPid,
    writeRunFile,
    writeRunnerPid,
} from "./leftovers.ts";
import { withRepoLock } from "./repo-lock.ts";
import {
    failureSummary,
    type RunnerIdentity,
    redactHome,
    runnerClosesStage,
    startNote,
} from "./report.ts";
import {
    type AgentPermissions,
    buildAgentArgs,
    buildAgentEnv,
    mcpConfig,
    readAllowList,
} from "./session.ts";
import { type HeartbeatAnswer, superviseAgent } from "./supervisor.ts";

export type AgentCommand = { command: string; args: string[] };

export type JobContext = {
    apiUrl: string;
    runner: RunnerIdentity;
    home: string;
    repoBase: string;
    agent: AgentCommand;
    permissions: AgentPermissions;
    keepWorktrees: boolean;
    api: RunnerApi;
    log: (line: string) => void;
    signal: AbortSignal;
    heartbeatIntervalMs?: number;
    killGraceMs?: number;
};

export type JobResult = {
    exit: RunnerExit;
    turns: number;
    durationMs: number;
    revoked: boolean;
};

const COST_DECIMALS = 4;
const PRIVATE_FILE_MODE = 0o600;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const PROGRESS_EVERY_MS = 60_000;
const LINE_BREAK = /\r?\n/;

class StepFailed extends Error {}

function runShell(
    command: string,
    cwd: string,
    env: NodeJS.ProcessEnv
): Promise<number> {
    return new Promise((resolve) => {
        const child = spawn("sh", ["-c", command], {
            cwd,
            env,
            stdio: "inherit",
        });
        child.on("error", () => resolve(1));
        child.on("close", (code) => resolve(code ?? 1));
    });
}

async function git(args: string[], cwd: string): Promise<void> {
    const result = await runGit({ args, cwd });
    if (result.code !== 0) {
        throw new StepFailed(
            `git ${args[0]}: ${result.stderr.trim().split("\n").at(-1) ?? ""}`
        );
    }
}

async function addWorktree(
    job: RunnerJob,
    ctx: JobContext,
    worktreeDir: string,
    repoDir: string
): Promise<void> {
    const paths = runnerPaths(ctx.home);
    if (existsSync(path.join(repoDir, ".git"))) {
        const fetched = await fetchOrigin(repoDir);
        if (fetched.code !== 0) {
            throw new StepFailed(
                `git fetch: ${fetched.stderr.trim().split("\n").at(-1) ?? ""}`
            );
        }
    } else {
        await mkdir(path.dirname(repoDir), { recursive: true, mode: 0o700 });
        await git(
            [
                "clone",
                repositoryUrl(
                    ctx.repoBase,
                    job.repository.owner,
                    job.repository.name
                ),
                repoDir,
            ],
            path.dirname(repoDir)
        );
    }
    const remoteHasBranch =
        (
            await runGit({
                args: [
                    "rev-parse",
                    "--verify",
                    "--quiet",
                    `refs/remotes/origin/${job.branch}`,
                ],
                cwd: repoDir,
            })
        ).code === 0;
    await releaseBranchWorktrees({
        repoDir,
        worktreesDir: paths.worktrees,
        runsDir: paths.runs,
        branch: job.branch,
    });
    const added = await runGitSteps(
        worktreePlan({
            repoDir,
            worktreeDir,
            branch: job.branch,
            baseBranch: job.repository.baseBranch,
            remoteHasBranch,
        })
    );
    if (added.code !== 0) {
        throw new StepFailed(
            `git worktree: ${added.stderr.trim().split("\n").at(-1) ?? ""}`
        );
    }
}

async function prepareWorktree(
    job: RunnerJob,
    ctx: JobContext,
    worktreeDir: string
): Promise<string> {
    const repoDir = path.join(
        runnerPaths(ctx.home).repos,
        job.repository.owner,
        job.repository.name
    );
    try {
        await withRepoLock(`${repoDir}.lock`, () =>
            addWorktree(job, ctx, worktreeDir, repoDir)
        );
    } catch (error) {
        throw error instanceof StepFailed
            ? error
            : new StepFailed((error as Error).message);
    }
    return repoDir;
}

type SessionOutcome = {
    exit: RunnerExit;
    turns: number;
    sessionId: string | null;
    detail: string | null;
    revoked: boolean;
};

type RunDirs = { worktreeDir: string; runDir: string; logsDir: string };

const tellBoard = (ctx: Pick<JobContext, "log">) => (error: Error) =>
    ctx.log(`o board não recebeu o aviso: ${error.message}`);

function elapsed(startedAt: number): string {
    const seconds = Math.round((Date.now() - startedAt) / MS_PER_SECOND);
    return seconds < SECONDS_PER_MINUTE
        ? `${seconds} s`
        : `${Math.floor(seconds / SECONDS_PER_MINUTE)} min ${seconds % SECONDS_PER_MINUTE} s`;
}

/**
 * Closes on the board the stages of runs a runner died in before it could (a duplicated or
 * second Ctrl+C, `kill -9`, the machine going down). Without this the card stays in "running"
 * until the stage deadline. The run's own token is used, so it works even after the runner was
 * registered again; a token already past its deadline is refused and the board's timeout wins.
 */
export async function reportLeftovers(
    leftovers: Leftover[],
    ctx: Pick<JobContext, "api" | "runner" | "log">
): Promise<void> {
    for (const { runId, run } of leftovers) {
        ctx.log(`limpou o resto da execução interrompida ${runId}`);
        if (run === null) {
            continue;
        }
        await ctx.api
            .tool(run.runToken, "complete_stage", {
                cardId: run.cardId,
                stage: run.stageKey,
                outcome: "failed",
                summary: failureSummary(
                    run,
                    run.runner ?? ctx.runner,
                    "interrupted",
                    "O runner foi encerrado antes de avisar o board, e a limpeza feita depois nesta máquina fechou a etapa."
                ),
            })
            .then(() =>
                ctx.log(
                    `avisou o board: ${run.command} ${run.slug} ficou como falha (interrompida)`
                )
            )
            .catch(tellBoard(ctx));
    }
}

async function resolvePermissions(
    ctx: JobContext,
    worktreeDir: string
): Promise<AgentPermissions> {
    if (ctx.permissions.mode === "skip") {
        return ctx.permissions;
    }
    const allow = await readAllowList(worktreeDir);
    if (allow.length === 0) {
        ctx.log(
            "aviso: o repositório não tem permissions.allow em .claude/settings.json; fora edição, git commit/push e as ferramentas do board, os comandos vão ser recusados"
        );
    }
    return { mode: "acceptEdits", allow };
}

/** Install, MCP config and the agent session, in the worktree that is already on the branch. */
async function runSession(
    job: RunnerJob,
    ctx: JobContext,
    dirs: RunDirs
): Promise<SessionOutcome> {
    const ref = { cardId: job.cardId, stage: job.stageKey };
    await ctx.api
        .tool(job.runToken, "post_update", {
            ...ref,
            markdown: startNote(job, ctx.runner),
        })
        .catch(tellBoard(ctx));

    const env = buildAgentEnv(process.env, job, ctx.apiUrl);
    if (job.install !== null) {
        ctx.log(`instalando dependências: ${job.install}`);
        if ((await runShell(job.install, dirs.worktreeDir, env)) !== 0) {
            throw new StepFailed("A instalação do environment.install falhou.");
        }
    }

    const mcpFile = path.join(dirs.runDir, "mcp.json");
    await writeFile(
        mcpFile,
        JSON.stringify(mcpConfig(ctx.apiUrl, job.runToken)),
        {
            mode: PRIVATE_FILE_MODE,
        }
    );
    const permissions = await resolvePermissions(ctx, dirs.worktreeDir);
    const activity = createActivityLog(dirs.worktreeDir);
    const sessionStartedAt = Date.now();
    let lastProgressAt = sessionStartedAt;
    ctx.log(
        `sessão do claude começou · log completo em ${path.join(dirs.logsDir, `${job.runId}.jsonl`)}`
    );

    let revoked = false;
    const result = await superviseAgent({
        command: ctx.agent.command,
        args: [...ctx.agent.args, ...buildAgentArgs(job, mcpFile, permissions)],
        cwd: dirs.worktreeDir,
        env,
        maxTurns: job.maxTurns,
        deadlineAt: new Date(job.deadlineAt),
        heartbeat: async (current): Promise<HeartbeatAnswer> => {
            if (Date.now() - lastProgressAt >= PROGRESS_EVERY_MS) {
                lastProgressAt = Date.now();
                ctx.log(
                    `em andamento: ${job.command} ${job.slug} · ${current}/${job.maxTurns} turnos · ${elapsed(sessionStartedAt)}`
                );
            }
            try {
                return await ctx.api.heartbeat(job.runId, current);
            } catch (error) {
                if (
                    error instanceof ApiError &&
                    error.code === "RUNNER_REVOKED"
                ) {
                    revoked = true;
                    return { revoked: true };
                }
                throw error;
            }
        },
        logFile: path.join(dirs.logsDir, `${job.runId}.jsonl`),
        signal: ctx.signal,
        onLine: (line) => {
            for (const described of activity.describe(line)) {
                ctx.log(described);
            }
        },
        onStderr: (text) => {
            for (const line of text.split(LINE_BREAK)) {
                if (line.trim() !== "") {
                    ctx.log(`  ! ${line.trim()}`);
                }
            }
        },
        onSpawn: (pid) => {
            writeAgentPid(dirs.runDir, pid).catch(() => null);
        },
        heartbeatIntervalMs: ctx.heartbeatIntervalMs,
        killGraceMs: ctx.killGraceMs,
    });
    if (result.costUsd !== null) {
        ctx.log(
            `custo informado pela sessão: US$ ${result.costUsd.toFixed(COST_DECIMALS)}`
        );
    }
    const failedExit =
        result.exit === "exited" &&
        result.exitCode !== null &&
        result.exitCode !== 0;
    return {
        exit: result.exit,
        turns: result.turns,
        sessionId: result.sessionId,
        detail: failedExit ? `Código de saída ${result.exitCode}.` : null,
        revoked,
    };
}

function outcomeOfFailure(
    error: unknown,
    ctx: JobContext,
    aborted: boolean
): SessionOutcome {
    const base = { turns: 0, sessionId: null, revoked: false };
    if (error instanceof StepFailed) {
        return {
            ...base,
            exit: aborted ? "interrupted" : "error",
            detail: error.message,
        };
    }
    ctx.log(`erro: ${(error as Error).message}`);
    return { ...base, exit: "error", detail: "Erro inesperado no runner." };
}

/**
 * Runs one claimed stage from start to end. Whatever happens, the board hears back: the
 * runner closes the stage as failed when the agent could not, reports the time, and
 * removes the worktree.
 */
export async function runJob(
    job: RunnerJob,
    ctx: JobContext
): Promise<JobResult> {
    const paths = runnerPaths(ctx.home);
    const dirs: RunDirs = {
        worktreeDir: path.join(paths.worktrees, job.runId),
        runDir: path.join(paths.runs, job.runId),
        logsDir: paths.logs,
    };
    const startedAt = Date.now();
    let repoDir: string | null = null;
    let outcome: SessionOutcome;

    try {
        if (!isSafeJob(job)) {
            throw new StepFailed(
                "O trabalho recebido tem campos fora do formato esperado."
            );
        }
        await reportLeftovers(await sweepLeftoverRuns(paths), ctx);
        await ensurePrivateDir(paths.worktrees);
        await ensurePrivateDir(dirs.runDir);
        await writeRunnerPid(dirs.runDir);
        await writeRunFile(dirs.runDir, {
            cardId: job.cardId,
            stageKey: job.stageKey,
            command: job.command,
            slug: job.slug,
            runToken: job.runToken,
            runner: ctx.runner,
        });
        await ensurePrivateDir(paths.logs);
        repoDir = await prepareWorktree(job, ctx, dirs.worktreeDir);
        if (ctx.signal.aborted) {
            throw new StepFailed("Interrompida antes de a sessão começar.");
        }
        outcome = await runSession(job, ctx, dirs);
    } catch (error) {
        outcome = outcomeOfFailure(error, ctx, ctx.signal.aborted);
    }

    if (runnerClosesStage(outcome.exit)) {
        await ctx.api
            .tool(job.runToken, "complete_stage", {
                cardId: job.cardId,
                stage: job.stageKey,
                outcome: "failed",
                summary: failureSummary(
                    job,
                    ctx.runner,
                    outcome.exit,
                    outcome.detail === null ? null : redactHome(outcome.detail)
                ),
            })
            .catch(tellBoard(ctx));
    }
    const durationMs = Date.now() - startedAt;
    await ctx.api
        .finish(job.runId, {
            turns: outcome.turns,
            durationMs,
            exit: outcome.exit,
            ...(outcome.sessionId === null
                ? {}
                : { sessionId: outcome.sessionId }),
        })
        .catch(tellBoard(ctx));

    await rm(dirs.runDir, { recursive: true, force: true });
    if (!ctx.keepWorktrees && repoDir !== null) {
        await runGitSteps(removeWorktreePlan(repoDir, dirs.worktreeDir));
        await rm(dirs.worktreeDir, { recursive: true, force: true });
    }
    ctx.log(
        `${job.command} ${job.slug}: ${outcome.exit} · ${outcome.turns} turnos · ${Math.round(durationMs / MS_PER_SECOND)} s`
    );
    return {
        exit: outcome.exit,
        turns: outcome.turns,
        durationMs,
        revoked: outcome.revoked,
    };
}
