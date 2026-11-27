import { stageRunnersOf } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { chooseExecutorFor } from "@/(shared)/lib/orchestrator/executor-choice";
import { triggerStage } from "@/(shared)/lib/orchestrator/orchestrator";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toCardDTO } from "@/(shared)/mappers/card.mapper";
import { toRunDTO } from "@/(shared)/mappers/run.mapper";
import { parseTriggerStage } from "@/(shared)/validation/run.schema";
import { requireBoardApi } from "@/app/(guards)/board";

type CardRouteParams = { id: string; slug: string };

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

/** Starts a stage on the card: a drag into the column, "run again" and "approve and go on". */
export const POST = requireBoardApi<CardRouteParams>(
    "trigger",
    async (req, ctx) => {
        const body = await parseRequestJson(req);
        if (!body.ok) {
            return body.response;
        }
        const parsed = parseTriggerStage(body.value);
        if (!parsed.ok) {
            return parsed.response;
        }
        const choice = await chooseExecutorFor(
            ctx.profile.id,
            new Date(),
            stageRunnersOf(ctx.board.config, parsed.value.stageKey)
        );
        if (!choice.ok) {
            return choice.refusal === "stage_not_served"
                ? errorResponse(
                      "RUN_NO_CREDENTIAL_FOR_STAGE",
                      HTTP_STATUS.CONFLICT
                  )
                : errorResponse(
                      "RUN_EXECUTOR_UNAVAILABLE",
                      HTTP_STATUS.SERVICE_UNAVAILABLE
                  );
        }

        const result = await triggerStage({
            board: ctx.board,
            slug: ctx.params.slug,
            stageKey: parsed.value.stageKey,
            by: { userId: ctx.profile.id, login: ctx.member.login },
        });
        if (!result.ok) {
            return errorResponse(result.code, result.status);
        }
        return Response.json(
            {
                data: {
                    card: toCardDTO(result.card),
                    run: toRunDTO(result.run),
                },
            },
            { status: HTTP_STATUS.CREATED }
        );
    }
);
