import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunnerExit, RunnerJob } from "@repo/kanban-contract";
import { ApiError, type RunnerApi } from "./api.ts";
import { ensurePrivateDir, runnerPaths } from "./config.ts";
import {
    removeWorktreePlan,
    repositoryUrl,
    runGit,
    runGitSteps,
    worktreePlan,
} from "./git.ts";
import { isSafeJob } from "./job.ts";
import {
    releaseBranchWorktrees,
    sweepLeftoverRuns,
    writeAgentPid,
    writeRunnerPid,
} from "./leftovers.ts";
import {
    failureSummary,
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
    runnerName: string;
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

async function prepareWorktree(
    job: RunnerJob,
    ctx: JobContext,
    worktreeDir: string
) {
    const paths = runnerPaths(ctx.home);
    const repoDir = path.join(
        paths.repos,
        job.repository.owner,
        job.repository.name
    );
    if (existsSync(path.join(repoDir, ".git"))) {
        await git(["fetch", "origin", "--prune"], repoDir);
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

const tellBoard = (ctx: JobContext) => (error: Error) =>
    ctx.log(`o board não recebeu o aviso: ${error.message}`);

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
            "aviso: o repositório não tem permissions.allow em .claude/settings.json; comandos fora de edição vão ser recusados"
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
            markdown: startNote(job, ctx.runnerName),
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

    let revoked = false;
    const result = await superviseAgent({
        command: ctx.agent.command,
        args: [...ctx.agent.args, ...buildAgentArgs(job, mcpFile, permissions)],
        cwd: dirs.worktreeDir,
        env,
        maxTurns: job.maxTurns,
        deadlineAt: new Date(job.deadlineAt),
        heartbeat: async (current): Promise<HeartbeatAnswer> => {
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
        onTool: (name) => ctx.log(`  · ${name}`),
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
        for (const runId of await sweepLeftoverRuns(paths)) {
            ctx.log(`limpou o resto da execução interrompida ${runId}`);
        }
        await ensurePrivateDir(paths.worktrees);
        await ensurePrivateDir(dirs.runDir);
        await writeRunnerPid(dirs.runDir);
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
                    ctx.runnerName,
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
