import type { RunnerExit, RunnerFinishInput } from "@repo/kanban-contract";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";
import type { RunnerRecord } from "@/(shared)/mappers/runner.mapper";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const EXIT_NOTE: Record<RunnerExit, string | null> = {
    exited: null,
    interrupted: "Interrompida no runner (Ctrl+C).",
    turn_limit: "Encerrada pelo limite de turnos da etapa.",
    deadline: "Encerrada pelo prazo da etapa.",
    stopped: "Parada no board.",
    error: "Encerrada por um erro no runner.",
};

export function formatDuration(durationMs: number): string {
    const seconds = Math.round(durationMs / MS_PER_SECOND);
    if (seconds < SECONDS_PER_MINUTE) {
        return `${seconds} s`;
    }
    return `${Math.round(seconds / SECONDS_PER_MINUTE)} min`;
}

/**
 * The timeline note the API writes when a runner finishes. Built only from numbers and
 * enums the schema checked, so nothing the runner sends is shown as free text.
 */
export function finishMarkdown(
    run: Pick<RunRecord, "command">,
    runner: Pick<RunnerRecord, "name">,
    input: RunnerFinishInput
): string {
    const turnsLabel = input.turns === 1 ? "turno" : "turnos";
    const lines = [
        `Runner \`${runner.name}\`: \`${run.command}\` terminou em ${formatDuration(input.durationMs)} · ${input.turns} ${turnsLabel}.`,
    ];
    const note = EXIT_NOTE[input.exit];
    if (note !== null) {
        lines.push("", note);
    }
    if (input.sessionId !== undefined) {
        lines.push("", `Sessão local: \`${input.sessionId}\``);
    }
    return lines.join("\n");
}
