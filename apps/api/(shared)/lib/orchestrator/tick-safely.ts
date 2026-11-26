import type { BoardDTO } from "@repo/sdk/src/types";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { tick } from "./orchestrator";

/** A board read never fails because a timeout or a fake result could not be applied. */
export async function tickSafely(board: BoardDTO): Promise<void> {
    try {
        await tick(board);
    } catch (error) {
        logEvent("orchestrator", "tick_failed", {
            boardId: board.id,
            name: error instanceof Error ? error.name : "unknown",
        });
    }
}
