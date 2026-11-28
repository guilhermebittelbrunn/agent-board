import os from "node:os";
import type { RunnerExit, RunnerJob } from "@repo/kanban-contract";
import { shortRunnerId } from "./config.ts";

const REASON: Record<RunnerExit, string> = {
    exited: "O agente terminou sem chamar complete_stage.",
    interrupted: "A execução foi interrompida no runner (Ctrl+C).",
    turn_limit: "A sessão passou do limite de turnos da etapa e foi encerrada.",
    deadline: "A sessão chegou ao prazo da etapa e foi encerrada.",
    stopped: "A execução foi parada no board.",
    error: "O runner encerrou a sessão por um erro.",
};

export type RunnerIdentity = { name: string; id: string };

/** The runner as the card names it: the host name alone repeats across runners of one machine. */
export const runnerLabel = (runner: RunnerIdentity): string =>
    `\`${runner.name}\` (id \`${shortRunnerId(runner.id)}\`)`;

/** Whether the runner closes the stage itself: a stop and a deadline are closed by the board. */
export function runnerClosesStage(exit: RunnerExit): boolean {
    return exit !== "stopped" && exit !== "deadline";
}

/** The stage report the runner sends when the agent could not, in the contract's template. */
export function failureSummary(
    job: Pick<RunnerJob, "command" | "slug">,
    runner: RunnerIdentity,
    exit: RunnerExit,
    detail: string | null = null
): string {
    return [
        `### ${job.command} — falhou no runner ${runnerLabel(runner)}`,
        "",
        `**O que foi feito:** ${REASON[exit]}${detail ? ` ${detail}` : ""}`,
        "**Decisões tomadas sem você:** nenhuma.",
        "**Commits:** nenhum registrado pelo runner.",
        "**Verificação:** não executada.",
        `**Pendências:** rodar \`${job.command} ${job.slug}\` de novo depois de ver o log local do runner.`,
    ].join("\n");
}

export function startNote(
    job: Pick<RunnerJob, "command" | "slug" | "branch">,
    runner: RunnerIdentity
): string {
    return `Runner ${runnerLabel(runner)} começou \`${job.command} ${job.slug}\` na branch \`${job.branch}\`.`;
}

/** The card is read by every board member: paths go there without this machine's user folder. */
export function redactHome(text: string, home = os.homedir()): string {
    return home === "" ? text : text.replaceAll(home, "~");
}
