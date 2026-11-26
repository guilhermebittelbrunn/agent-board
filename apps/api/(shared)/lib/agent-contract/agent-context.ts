import type { BoardDTO } from "@repo/sdk/src/types";
import type { CardRecord } from "@/(shared)/mappers/card.mapper";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";

/** Who is calling: the run a valid token belongs to, with its board and card. */
export type AgentContext = {
    run: RunRecord;
    board: BoardDTO;
    card: CardRecord;
    now: Date;
};
