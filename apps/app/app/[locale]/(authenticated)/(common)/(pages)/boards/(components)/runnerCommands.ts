/**
 * The commands the person runs on the machine. The CLI lives in the agent-board repository's
 * `apps/runner`; `install-bin` copies it out of the checkout and puts `agent-board-runner` on
 * the PATH, so every other command runs from any folder.
 */
export const RUNNER_SETUP_COMMANDS = {
    install: "pnpm install && pnpm --filter runner install-bin",
    start: "agent-board-runner start",
    list: "agent-board-runner list",
    update: "git pull && pnpm install && pnpm --filter runner install-bin",
} as const;

export function runnerRegisterCommand(code: string, apiUrl: string): string {
    return `agent-board-runner register ${code} --api ${apiUrl}`;
}
