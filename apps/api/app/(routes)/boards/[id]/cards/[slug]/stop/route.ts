import { stopRun } from "@/(shared)/lib/orchestrator/orchestrator";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

export const POST = requireBoardApi<CardRouteParams>(
    "trigger",
    async (_req, ctx) => {
        const result = await stopRun({
            board: ctx.board,
            slug: ctx.params.slug,
            by: { userId: ctx.profile.id, login: ctx.member.login },
        });
        if (!result.ok) {
            return Response.json(
                { error: { code: result.code } },
                { status: result.status }
            );
        }
        return Response.json({ data: toCardDTO(result.card) });
    }
);
