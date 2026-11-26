import type { AgentContractTool } from "@repo/kanban-contract";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";

export type ScopeRefusal = "AGENT_CARD_MISMATCH" | "AGENT_STAGE_MISMATCH";

/** A run token only reaches the card, the stage and the board of its own run. */
export function checkToolScope(
    tool: AgentContractTool,
    input: { cardId?: string; stage?: string; boardId?: string },
    run: Pick<RunRecord, "boardId" | "cardId" | "stageKey">
): ScopeRefusal | null {
    if (tool === "create_card") {
        return input.boardId === run.boardId ? null : "AGENT_CARD_MISMATCH";
    }
    if (input.cardId !== run.cardId) {
        return "AGENT_CARD_MISMATCH";
    }
    if (tool !== "get_card" && input.stage !== run.stageKey) {
        return "AGENT_STAGE_MISMATCH";
    }
    return null;
}
