import type { CardSyncResultDTO } from "@repo/sdk/src/types";
import { sortCards } from "@/(shared)/lib/card-order";
import { planBacklogSync, readBacklog } from "@/(shared)/lib/card-sync";
import { getGithubClient } from "@/(shared)/lib/github/github-client";
import { githubAppNotConfiguredResponse } from "@/(shared)/lib/github/github-errors";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

export const POST = requireBoardApi("prioritize", async (_req, ctx) => {
    const client = getGithubClient();
    if (!client) {
        return githubAppNotConfiguredResponse();
    }
    const read = await readBacklog(client, ctx.board);
    if (!read.ok) {
        return read.response;
    }

    const now = new Date();
    const existing = await cardRepository.listByBoard(ctx.board.id);
    const plan = planBacklogSync({
        boardId: ctx.board.id,
        existing,
        specs: read.specs,
        config: ctx.board.config,
        now,
    });
    await cardRepository.applySync(plan.writes);
    const backlogSync = await boardRepository.recordBacklogSync(ctx.board.id, {
        indexPath: read.index.path,
        indexSha: read.index.sha,
        ref: read.index.ref,
        syncedAt: now,
        specCount: plan.specCount,
    });
    const cards = await cardRepository.listByBoard(ctx.board.id);

    const data: CardSyncResultDTO = {
        ...plan.summary,
        skipped: [...read.skipped, ...plan.skipped],
        cards: sortCards(cards).map(toCardDTO),
        backlogSync,
    };
    return Response.json({ data });
});
