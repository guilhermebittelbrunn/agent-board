import { type BoardConfig, SPEC_STAGE_KEY } from "@repo/kanban-contract";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

/** The column a stage shows in; the spec stage is the Drafts column, named by the dictionary. */
export function stageColumnName(
    config: Pick<BoardConfig, "stages">,
    stageKey: string | null,
    boardsDictionary: BoardsDictionary
): string | null {
    if (stageKey === SPEC_STAGE_KEY) {
        return boardsDictionary.board.columns.drafts;
    }
    return (
        config.stages.find((stage) => stage.key === stageKey)?.column ?? null
    );
}
