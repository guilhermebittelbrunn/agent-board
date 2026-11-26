import type { BoardConfig } from "@repo/kanban-contract";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type BoardRulesSummaryProps = {
    config: BoardConfig;
    boardsDictionary: BoardsDictionary;
};

export function BoardRulesSummary({
    config,
    boardsDictionary,
}: BoardRulesSummaryProps) {
    const rulesCopy = boardsDictionary.wizard.rules;
    const rules = [
        { label: rulesCopy.baseBranch, value: config.baseBranch, mono: true },
        {
            label: rulesCopy.branchPattern,
            value: config.branchPattern,
            mono: true,
        },
        {
            label: rulesCopy.reworkLoops,
            value: fillMessage(rulesCopy.reworkLoopsValue, {
                count: config.limits.maxReworkLoops,
            }),
            mono: false,
        },
        {
            label: rulesCopy.turns,
            value: fillMessage(rulesCopy.turnsValue, {
                count: config.limits.maxTurnsPerStage,
            }),
            mono: false,
        },
        {
            label: rulesCopy.protectedBranches,
            value: config.protectedBranches.join(", "),
            mono: true,
        },
        {
            label: rulesCopy.setup,
            value: config.environment.setupScript ?? rulesCopy.none,
            mono: Boolean(config.environment.setupScript),
        },
    ];

    return (
        <section className="flex flex-col gap-3">
            <h2 className="font-semibold text-lg">{rulesCopy.title}</h2>
            <dl className="grid grid-cols-1 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 lg:grid-cols-3">
                {rules.map((rule) => (
                    <div
                        className="flex min-w-0 flex-col gap-1 border-b p-4 sm:border-r"
                        key={rule.label}
                    >
                        <dt className="text-muted-foreground text-xs">
                            {rule.label}
                        </dt>
                        <dd
                            className={
                                rule.mono
                                    ? "break-words font-mono text-sm"
                                    : "text-sm"
                            }
                        >
                            {rule.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
