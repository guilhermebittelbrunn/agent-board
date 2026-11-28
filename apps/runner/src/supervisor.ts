import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import type { RunnerExit } from "@repo/kanban-contract";
import { createTurnCounter, readStreamLine } from "./turns.ts";

export type HeartbeatAnswer = { active: boolean } | { revoked: true };

export type SupervisorResult = {
    exit: RunnerExit;
    turns: number;
    sessionId: string | null;
    durationMs: number;
    exitCode: number | null;
    costUsd: number | null;
};

export type SupervisorInput = {
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    maxTurns: number;
    deadlineAt: Date;
    heartbeat: (turns: number) => Promise<HeartbeatAnswer>;
    logFile: string;
    signal: AbortSignal;
    /** Every line of the session's stream-json, as it arrives. */
    onLine?: (line: string) => void;
    /** What the session writes to stderr, such as the CLI's own warnings. */
    onStderr?: (text: string) => void;
    onSpawn?: (pid: number) => void;
    heartbeatIntervalMs?: number;
    killGraceMs?: number;
};

const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_KILL_GRACE_MS = 10_000;

const liveGroups = new Set<number>();

/** For a runner that exits at once (second Ctrl+C): no agent outlives it with the run token. */
export function killAgentsNow(): void {
    for (const pid of liveGroups) {
        try {
            process.kill(-pid, "SIGKILL");
        } catch {
            // The group is already gone.
        }
    }
    liveGroups.clear();
}

/**
 * Runs the agent and stops it for the first reason that comes: too many turns, a stop or
 * revocation seen on the heartbeat, the stage deadline, or Ctrl+C. The child gets its own
 * process group so the tools it started die with it.
 */
export function superviseAgent(
    input: SupervisorInput
): Promise<SupervisorResult> {
    const startedAt = Date.now();
    const counter = createTurnCounter();
    const log = createWriteStream(input.logFile, { flags: "a", mode: 0o600 });
    const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
    });
    const pid = child.pid;
    if (pid !== undefined) {
        liveGroups.add(pid);
        input.onSpawn?.(pid);
    }

    let reason: RunnerExit | null = null;
    let costUsd: number | null = null;
    let killTimer: NodeJS.Timeout | null = null;

    const signalGroup = (name: NodeJS.Signals) => {
        if (child.pid === undefined) {
            return;
        }
        try {
            process.kill(-child.pid, name);
        } catch {
            child.kill(name);
        }
    };

    const stop = (why: RunnerExit) => {
        if (reason !== null) {
            return;
        }
        reason = why;
        signalGroup("SIGTERM");
        killTimer = setTimeout(
            () => signalGroup("SIGKILL"),
            input.killGraceMs ?? DEFAULT_KILL_GRACE_MS
        );
        killTimer.unref();
    };

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
        log.write(`${line}\n`);
        // Output still buffered after a stop is logged but not counted, so the turns reported
        // are the ones the session had when the runner decided to stop it.
        input.onLine?.(line);
        const event =
            reason === null ? counter.observe(line) : readStreamLine(line);
        if (event?.kind === "result") {
            costUsd = event.costUsd;
            if (event.maxTurnsReached) {
                reason ??= "turn_limit";
            }
        }
        if (counter.turns > input.maxTurns) {
            stop("turn_limit");
        }
    });
    child.stderr.on("data", (chunk: Buffer) => {
        log.write(chunk);
        input.onStderr?.(chunk.toString("utf8"));
    });

    const heartbeatTimer = setInterval(() => {
        input
            .heartbeat(counter.turns)
            .then((answer) => {
                if ("revoked" in answer) {
                    stop("error");
                } else if (!answer.active) {
                    stop("stopped");
                }
            })
            .catch(() => null);
    }, input.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS);

    const untilDeadline = Math.max(0, input.deadlineAt.getTime() - Date.now());
    const deadlineTimer = setTimeout(() => stop("deadline"), untilDeadline);

    const onAbort = () => stop("interrupted");
    if (input.signal.aborted) {
        onAbort();
    } else {
        input.signal.addEventListener("abort", onAbort, { once: true });
    }

    return new Promise((resolve) => {
        let settled = false;
        const finish = (exitCode: number | null, failed: boolean) => {
            if (settled) {
                return;
            }
            settled = true;
            if (pid !== undefined) {
                liveGroups.delete(pid);
            }
            clearInterval(heartbeatTimer);
            clearTimeout(deadlineTimer);
            if (killTimer !== null) {
                clearTimeout(killTimer);
            }
            input.signal.removeEventListener("abort", onAbort);
            log.end();
            resolve({
                exit: reason ?? (failed ? "error" : "exited"),
                turns: counter.turns,
                sessionId: counter.sessionId,
                durationMs: Date.now() - startedAt,
                exitCode,
                costUsd,
            });
        };
        child.on("error", () => finish(null, true));
        child.on("close", (code) => finish(code, false));
    });
}
