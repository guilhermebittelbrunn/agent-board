import type { StageConfig } from "@repo/kanban-contract";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import type { CycleProgressCell, CycleProgressRow } from "./cycleProgress";

type CycleProgressTableProps = {
    rows: CycleProgressRow[];
    stages: readonly Pick<StageConfig, "key" | "column">[];
    boardsDictionary: BoardsDictionary;
};

function cellText(
    cell: CycleProgressCell,
    boardsDictionary: BoardsDictionary
): string {
    const progressCopy = boardsDictionary.cycles.detail.progress;
    switch (cell.kind) {
        case "done":
            return progressCopy.done;
        case "pending":
            return progressCopy.pending;
        case "pullRequest":
            return fillMessage(
                cell.draft
                    ? progressCopy.pullRequestDraft
                    : progressCopy.pullRequest,
                { number: cell.number }
            );
        default:
            return cell.reworkLoops > 0
                ? fillMessage(progressCopy.reworkLoop, {
                      state: boardsDictionary.board.card.states[cell.state],
                      loop: cell.reworkLoops,
                  })
                : boardsDictionary.board.card.states[cell.state];
    }
}

/** Spec × stage. The table scrolls inside its own box, so the page never scrolls sideways. */
export function CycleProgressTable({
    rows,
    stages,
    boardsDictionary,
}: CycleProgressTableProps) {
    const progressCopy = boardsDictionary.cycles.detail.progress;
    const itemStatus = boardsDictionary.cycles.itemStatus;

    return (
        <section className="flex flex-col gap-3">
            <h3 className="font-semibold text-base">{progressCopy.title}</h3>
            <div className="w-full overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[36rem] text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                        <tr>
                            <th className="p-3 font-medium" scope="col">
                                {progressCopy.spec}
                            </th>
                            {stages.map((stage) => (
                                <th
                                    className="p-3 font-medium"
                                    key={stage.key}
                                    scope="col"
                                >
                                    {stage.column}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr className="border-t" key={row.slug}>
                                <th
                                    className="p-3 text-left font-normal"
                                    scope="row"
                                >
                                    <span className="block font-medium">
                                        {row.position}. {row.title}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                        {itemStatus[row.status]}
                                    </span>
                                </th>
                                {row.cells.map((cell, index) => (
                                    <td
                                        className={
                                            cell.kind === "current"
                                                ? "p-3 font-medium"
                                                : "p-3 text-muted-foreground"
                                        }
                                        key={stages[index]?.key ?? index}
                                    >
                                        {cellText(cell, boardsDictionary)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
