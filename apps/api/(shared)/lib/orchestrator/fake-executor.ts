import {
    type ActiveRunView,
    type ExecutorReport,
    type Question,
    STAGE_OUTCOMES,
    type StageDecision,
    type StageDispatch,
    type StageExecutor,
    type StageOutcome,
} from "@repo/kanban-contract";

export const FAKE_EXECUTOR_SCRIPT_TABLE = "fakeExecutorScript";

/** How long a fake run takes before it reports, so the board shows it running. */
export const FAKE_RUN_DURATION_MS = 3000;

/** `silent` never reports, so the stage timeout is what ends the run. */
export type FakeOutcome = StageOutcome | "silent";
export const FAKE_OUTCOMES: readonly FakeOutcome[] = [
    ...STAGE_OUTCOMES,
    "silent",
];

export type FakeScript = {
    outcomes: FakeOutcome[];
    /** The outcome each run already took, so two readers never consume the same entry. */
    claims: Record<string, FakeOutcome>;
};

export const FAKE_QUESTION: Question = {
    question: "Qual caminho a etapa deve seguir?",
    header: "Caminho",
    options: [
        {
            label: "Seguir o plano",
            description: "Mantém o que já foi decidido.",
        },
        { label: "Reduzir o escopo", description: "Entrega só o essencial." },
    ],
    recommended: 0,
};

export function isDue(run: ActiveRunView, now: Date): boolean {
    return now.getTime() - run.startedAt.getTime() >= FAKE_RUN_DURATION_MS;
}

/**
 * The outcome a run takes from the card's script. A run that already claimed one gets
 * `null`: someone else is reporting it. Without a script every run succeeds.
 */
export function claimOutcome(
    script: FakeScript | null,
    runId: string
): { outcome: FakeOutcome; script: FakeScript } | null {
    const current = script ?? { outcomes: [], claims: {} };
    if (runId in current.claims) {
        return null;
    }
    const [next, ...rest] = current.outcomes;
    const outcome = next ?? "success";
    return {
        outcome,
        script: {
            outcomes: rest,
            claims: { ...current.claims, [runId]: outcome },
        },
    };
}

export function toFakeScript(value: unknown): FakeScript | null {
    if (value === null || typeof value !== "object") {
        return null;
    }
    const record = value as Record<string, unknown>;
    const outcomes = Array.isArray(record.outcomes)
        ? record.outcomes.filter((outcome): outcome is FakeOutcome =>
              FAKE_OUTCOMES.includes(outcome as FakeOutcome)
          )
        : [];
    const claims =
        record.claims !== null && typeof record.claims === "object"
            ? (record.claims as Record<string, FakeOutcome>)
            : {};
    return { outcomes, claims };
}

const SUMMARY: Record<StageOutcome, string> = {
    success: "concluída",
    needs_input: "parou com uma pergunta",
    needs_rework: "pediu retrabalho",
    failed: "falhou",
};

export const FAKE_TECHNICAL_DECISION: StageDecision = {
    decision: "Seguiu o padrão do repositório para a parte técnica da etapa.",
    rule: "repo_pattern",
    product: false,
};

export const FAKE_PRODUCT_DECISION: StageDecision = {
    decision: "Adotou a recomendação da spec para o escopo visível ao usuário.",
    rule: "spec",
    product: true,
};

const ANALYSIS_COMMAND = "/analyze";

/** What a cycle run decides on its own: one technical decision, plus one of product in the analysis. */
function fakeDecisions(run: ActiveRunView): StageDecision[] {
    return run.command === ANALYSIS_COMMAND
        ? [FAKE_TECHNICAL_DECISION, FAKE_PRODUCT_DECISION]
        : [FAKE_TECHNICAL_DECISION];
}

/**
 * The simulated report of a run. Inside a cycle nobody answers questions, so a `needs_input`
 * there carries none, as the API refuses `ask` to a real agent.
 */
export function fakeReport(
    run: ActiveRunView,
    outcome: StageOutcome
): ExecutorReport {
    const summary = [
        `### Executor de teste: ${run.command} ${SUMMARY[outcome]}`,
        "",
        "**O que foi feito:** nada; o resultado é simulado e nenhum agente rodou.",
    ].join("\n");
    const inCycle = run.cycleId !== null;
    if (outcome === "needs_input" && !inCycle) {
        return {
            runId: run.runId,
            outcome,
            summary,
            questions: [FAKE_QUESTION],
        };
    }
    if (outcome === "success" && inCycle) {
        return {
            runId: run.runId,
            outcome,
            summary,
            decisions: fakeDecisions(run),
        };
    }
    return { runId: run.runId, outcome, summary };
}

export function dispatchNote(input: StageDispatch): string {
    return `Executor de teste: \`${input.command} ${input.slug}\` iniciado na branch \`${input.branch}\`.`;
}

export type FakeExecutorPorts = {
    claim: (cardId: string, runId: string) => Promise<FakeOutcome | null>;
    note: (input: StageDispatch, markdown: string) => Promise<void>;
};

/** An executor that runs nothing: it answers from a script after a few seconds. */
export function createFakeExecutor(ports: FakeExecutorPorts): StageExecutor {
    return {
        kind: "fake",
        async dispatch(input) {
            await ports.note(input, dispatchNote(input));
            return { ok: true, sessionUrl: null };
        },
        cancel: () => Promise.resolve(),
        async collect(runs, now) {
            const reports: ExecutorReport[] = [];
            for (const run of runs.filter((candidate) =>
                isDue(candidate, now)
            )) {
                const outcome = await ports.claim(run.cardId, run.runId);
                if (outcome !== null && outcome !== "silent") {
                    reports.push(fakeReport(run, outcome));
                }
            }
            return reports;
        },
    };
}
