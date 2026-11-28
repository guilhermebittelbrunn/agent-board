import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RunnerJob } from "@repo/kanban-contract";

const TRAILING_SLASH = /\/$/;

export const RUNNER_TOKEN_ENV = "AGENT_BOARD_RUNNER_TOKEN";

/**
 * `acceptEdits` plus the repository's own allow list (and what board mode needs) is the
 * default: a command outside the list is refused and the stage tends to stop, which is the
 * safe failure. Skipping every
 * permission check only happens when the person asked for it by name.
 */
export type AgentPermissions =
    | { mode: "acceptEdits"; allow: string[] }
    | { mode: "skip" };

/**
 * Only the expected fields: the spec and the answers reach the agent through `get_card`.
 * `--cycle` tells the agent nobody answers before the cycle ends, so it decides on its own.
 */
export function buildPrompt(job: RunnerJob): string {
    const prompt = `${job.command} ${job.slug} --board ${job.cardId}`;
    return job.cycleId === null ? prompt : `${prompt} --cycle ${job.cycleId}`;
}

/**
 * What board mode needs whatever the repository allows: the tools of the `kanban` server the
 * runner itself configures, and committing and pushing the card's branch at the end of every
 * stage. A repository's allow list rarely names either, and without them the session can
 * neither read its card nor close it.
 */
export function boardModeTools(job: Pick<RunnerJob, "branch">): string[] {
    return [
        "mcp__kanban",
        "Bash(git add:*)",
        "Bash(git commit:*)",
        "Bash(git push)",
        `Bash(git push origin ${job.branch})`,
        `Bash(git push -u origin ${job.branch})`,
    ];
}

export function buildAgentArgs(
    job: RunnerJob,
    mcpConfigPath: string,
    permissions: AgentPermissions
): string[] {
    const args = [
        "-p",
        buildPrompt(job),
        "--model",
        job.model,
        "--effort",
        job.effort,
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        String(job.maxTurns),
        "--mcp-config",
        mcpConfigPath,
    ];
    if (permissions.mode === "skip") {
        return [...args, "--dangerously-skip-permissions"];
    }
    const allowed = [
        ...new Set([...boardModeTools(job), ...permissions.allow]),
    ];
    // `--allowedTools` takes every argument after it, so it has to come last.
    return [
        ...args,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        ...allowed,
    ];
}

/**
 * The agent gets the run's token, never the runner's: a session that leaks its token can
 * only write to its own card until the stage's deadline.
 */
export function buildAgentEnv(
    base: NodeJS.ProcessEnv,
    job: RunnerJob,
    apiUrl: string
): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(base)) {
        if (key === RUNNER_TOKEN_ENV || value?.startsWith("kbl_")) {
            continue;
        }
        env[key] = value;
    }
    return {
        ...withGitConfig(env, "push.default", "simple"),
        KANBAN_RUN_TOKEN: job.runToken,
        KANBAN_API_URL: apiUrl,
        KANBAN_CARD_ID: job.cardId,
    };
}

/**
 * `git push` with no arguments is allowed, and with `push.default=matching` in the person's
 * git config it would push every branch of the shared clone that also exists on the remote,
 * other cards' branches included. `simple` pushes only the branch checked out in the worktree.
 * Entries already in the environment are kept; this one is added after them.
 */
function withGitConfig(
    env: NodeJS.ProcessEnv,
    key: string,
    value: string
): NodeJS.ProcessEnv {
    const count = Number.parseInt(env.GIT_CONFIG_COUNT ?? "0", 10);
    const index = Number.isInteger(count) && count > 0 ? count : 0;
    return {
        ...env,
        GIT_CONFIG_COUNT: String(index + 1),
        [`GIT_CONFIG_KEY_${index}`]: key,
        [`GIT_CONFIG_VALUE_${index}`]: value,
    };
}

/**
 * The token is written as is: environment expansion is documented for `.mcp.json`, not for
 * `--mcp-config`. The file lives outside the worktree, readable only by this user, and is
 * removed when the run ends.
 */
export function mcpConfig(apiUrl: string, runToken: string): object {
    return {
        mcpServers: {
            kanban: {
                type: "http",
                url: `${apiUrl.replace(TRAILING_SLASH, "")}/mcp`,
                headers: { Authorization: `Bearer ${runToken}` },
            },
        },
    };
}

/** The `permissions.allow` list of the target repository's `.claude/settings.json`. */
export async function readAllowList(worktreeDir: string): Promise<string[]> {
    try {
        const raw = await readFile(
            path.join(worktreeDir, ".claude", "settings.json"),
            "utf8"
        );
        const allow = (JSON.parse(raw) as { permissions?: { allow?: unknown } })
            .permissions?.allow;
        // A rule starting with `-` would reach the claude command line as one of its flags.
        return Array.isArray(allow)
            ? allow.filter(
                  (rule): rule is string =>
                      typeof rule === "string" && !rule.startsWith("-")
              )
            : [];
    } catch {
        return [];
    }
}
