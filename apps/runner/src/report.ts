import os from "node:os";
import type { RunnerExit, RunnerJob } from "@repo/kanban-contract";

const REASON: Record<RunnerExit, string> = {
    exited: "O agente terminou sem chamar complete_stage.",
    interrupted: "A execução foi interrompida no runner (Ctrl+C).",
    turn_limit: "A sessão passou do limite de turnos da etapa e foi encerrada.",
    deadline: "A sessão chegou ao prazo da etapa e foi encerrada.",
    stopped: "A execução foi parada no board.",
    error: "O runner encerrou a sessão por um erro.",
};

/** Whether the runner closes the stage itself: a stop and a deadline are closed by the board. */
export function runnerClosesStage(exit: RunnerExit): boolean {
    return exit !== "stopped" && exit !== "deadline";
}

/** The stage report the runner sends when the agent could not, in the contract's template. */
export function failureSummary(
    job: Pick<RunnerJob, "command" | "slug">,
    runnerName: string,
    exit: RunnerExit,
    detail: string | null = null
): string {
    return [
        `### ${job.command} — falhou no runner \`${runnerName}\``,
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
    runnerName: string
): string {
    return `Runner \`${runnerName}\` começou \`${job.command} ${job.slug}\` na branch \`${job.branch}\`.`;
}

/** The card is read by every board member: paths go there without this machine's user folder. */
export function redactHome(text: string, home = os.homedir()): string {
    return home === "" ? text : text.replaceAll(home, "~");
}
