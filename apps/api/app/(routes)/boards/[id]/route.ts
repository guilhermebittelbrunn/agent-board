import { toBoardView } from "@/(shared)/lib/board-view";
import { resolveExecutorFor } from "@/(shared)/lib/orchestrator/executor-choice";
import { requireBoardApi } from "@/app/(guards)/board";

export const GET = requireBoardApi("view", async (_req, ctx) =>
    Response.json({
        data: toBoardView(
            ctx.board,
            ctx.access,
            await resolveExecutorFor(ctx.subjectProfile.id)
        ),
    })
);
