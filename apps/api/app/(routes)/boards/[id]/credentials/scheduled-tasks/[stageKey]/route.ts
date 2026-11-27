import { stageAcceptsRunner } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { credentialsKey } from "@/(shared)/lib/credentials/credentials-key";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toScheduledTaskCredentialDTO } from "@/(shared)/mappers/credential.mapper";
import { credentialRepository } from "@/(shared)/repositories/credential.repository";
import { parseSaveScheduledTask } from "@/(shared)/validation/credential.schema";
import { requireBoardApi } from "@/app/(guards)/board";
import { env } from "@/env";

type ScheduledTaskRouteParams = { id: string; stageKey: string };

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

/** Saves or replaces the person's scheduled task for one stage. The answer carries only the last characters. */
export const PUT = requireBoardApi<ScheduledTaskRouteParams>(
    "trigger",
    async (req, ctx) => {
        const key = credentialsKey(env);
        if (!key) {
            return errorResponse(
                "CREDENTIALS_ENCRYPTION_NOT_CONFIGURED",
                HTTP_STATUS.SERVICE_UNAVAILABLE
            );
        }
        const stage = ctx.board.config.stages.find(
            (item) => item.key === ctx.params.stageKey
        );
        if (!stage) {
            return errorResponse(
                "CREDENTIAL_STAGE_NOT_FOUND",
                HTTP_STATUS.NOT_FOUND
            );
        }
        if (!stageAcceptsRunner(stage, "cloud")) {
            return errorResponse(
                "CREDENTIAL_STAGE_NOT_CLOUD",
                HTTP_STATUS.CONFLICT
            );
        }
        const body = await parseRequestJson(req);
        if (!body.ok) {
            return body.response;
        }
        const parsed = parseSaveScheduledTask(body.value);
        if (!parsed.ok) {
            return parsed.response;
        }

        const saved = await credentialRepository.saveScheduledTask({
            boardId: ctx.board.id,
            userId: ctx.profile.id,
            stageKey: stage.key,
            task: parsed.value,
            key,
            now: new Date(),
        });
        logEvent("credential", "saved", {
            boardId: ctx.board.id,
            stageKey: stage.key,
        });
        return Response.json({ data: toScheduledTaskCredentialDTO(saved) });
    }
);

export const DELETE = requireBoardApi<ScheduledTaskRouteParams>(
    "trigger",
    async (_req, ctx) => {
        const removed = await credentialRepository.removeOwned(
            {
                boardId: ctx.board.id,
                userId: ctx.profile.id,
                stageKey: ctx.params.stageKey,
            },
            new Date()
        );
        if (!removed) {
            return errorResponse("CREDENTIAL_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
        }
        logEvent("credential", "removed", {
            boardId: ctx.board.id,
            stageKey: ctx.params.stageKey,
        });
        return new Response(null, { status: 204 });
    }
);
