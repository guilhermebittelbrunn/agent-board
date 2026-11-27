import {
    AGENT_CONTRACT_TOOLS,
    type AgentAttachmentContent,
    type AgentCompleteResult,
    type AgentContractTool,
    type AgentEventResult,
    type GetAttachmentInput,
    isAgentContractTool,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    type AgentEventInput,
    agentEventFromTool,
} from "@/(shared)/lib/card-events";
import { completeRun } from "@/(shared)/lib/orchestrator/orchestrator";
import { isStorageConfigured, readObject } from "@/(shared)/lib/storage";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { buildAgentCardView } from "./agent-card-view";
import type { AgentContext } from "./agent-context";
import { checkToolScope } from "./agent-scope";

export type AgentToolOutcome =
    | { ok: true; data: unknown }
    | { ok: false; code: string; status: number };

const refuse = (code: string, status: number): AgentToolOutcome => ({
    ok: false,
    code,
    status,
});

const EVENT_REFUSAL_STATUS = {
    CARD_STAGE_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
    CARD_ARTIFACT_PATH_INVALID: HTTP_STATUS.UNPROCESSABLE_ENTITY,
} as const;

async function recordEvent(
    event: AgentEventInput,
    ctx: AgentContext
): Promise<AgentToolOutcome> {
    const written = agentEventFromTool(event, {
        card: ctx.card,
        config: ctx.board.config,
    });
    if (!written.ok) {
        return refuse(written.code, EVENT_REFUSAL_STATUS[written.code]);
    }
    const stored = await cardEventRepository.appendAgentEvent(ctx.card, {
        ...written.write,
        runId: ctx.run.id,
        cycleId: ctx.run.cycleId,
    });
    if (!stored.ok) {
        return refuse(stored.code, HTTP_STATUS.CONFLICT);
    }
    return {
        ok: true,
        data: { eventId: stored.event.id } satisfies AgentEventResult,
    };
}

async function completeStage(
    event: Extract<AgentEventInput, { tool: "complete_stage" }>,
    ctx: AgentContext
): Promise<AgentToolOutcome> {
    const report = await recordEvent(event, ctx);
    if (!report.ok) {
        return report;
    }
    const result = await completeRun({
        board: ctx.board,
        runId: ctx.run.id,
        outcome: event.input.outcome,
        endReason: "agent",
        now: ctx.now,
    });
    return {
        ok: true,
        data: { ignored: result.ignored } satisfies AgentCompleteResult,
    };
}

/** Only an attachment of this run's own card is found, so another card's id answers 404. */
async function readAttachment(
    input: GetAttachmentInput,
    ctx: AgentContext
): Promise<AgentToolOutcome> {
    const attachment = ctx.card.request?.attachments.find(
        (candidate) => candidate.id === input.attachmentId
    );
    if (attachment === undefined) {
        return refuse("AGENT_ATTACHMENT_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }
    if (!isStorageConfigured()) {
        return refuse(
            "STORAGE_NOT_CONFIGURED",
            HTTP_STATUS.SERVICE_UNAVAILABLE
        );
    }
    let contents: Buffer;
    try {
        contents = await readObject(attachment.path);
    } catch {
        return refuse("AGENT_ATTACHMENT_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }
    const { id, name, contentType } = attachment;
    return {
        ok: true,
        data: {
            id,
            name,
            contentType,
            size: contents.length,
            base64: contents.toString("base64"),
        } satisfies AgentAttachmentContent,
    };
}

async function runTool(
    tool: AgentContractTool,
    input: unknown,
    ctx: AgentContext
): Promise<AgentToolOutcome> {
    switch (tool) {
        case "get_card":
            return { ok: true, data: await buildAgentCardView(ctx) };
        case "get_attachment":
            return await readAttachment(input as GetAttachmentInput, ctx);
        case "ask":
            // Nobody answers before a cycle ends, so its agent decides and records why instead.
            if (ctx.run.cycleId !== null) {
                return refuse("AGENT_ASK_IN_CYCLE", HTTP_STATUS.CONFLICT);
            }
            return await recordEvent({ tool, input } as AgentEventInput, ctx);
        case "post_update":
        case "attach_artifact":
            return await recordEvent({ tool, input } as AgentEventInput, ctx);
        case "complete_stage":
            return await completeStage(
                {
                    tool,
                    input,
                } as Extract<AgentEventInput, { tool: "complete_stage" }>,
                ctx
            );
        default:
            return refuse(
                "AGENT_TOOL_NOT_AVAILABLE",
                HTTP_STATUS.NOT_IMPLEMENTED
            );
    }
}

/**
 * The one path every agent call takes, over HTTP or MCP: the input is validated with the
 * contract schema, kept inside the token's run, and written as data. Ending the stage goes
 * through `completeRun`, which alone decides where the card goes.
 */
export async function callAgentTool(
    tool: string,
    rawInput: unknown,
    ctx: AgentContext
): Promise<AgentToolOutcome> {
    if (!isAgentContractTool(tool)) {
        return refuse("AGENT_TOOL_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }
    const parsed = AGENT_CONTRACT_TOOLS[tool].safeParse(rawInput);
    if (!parsed.success) {
        return refuse("VALIDATION_FAILED", HTTP_STATUS.BAD_REQUEST);
    }
    const scope = checkToolScope(tool, parsed.data, ctx.run);
    if (scope !== null) {
        return refuse(scope, HTTP_STATUS.FORBIDDEN);
    }
    // After the run ends the token only serves to repeat `complete_stage`, harmlessly.
    if (!ctx.run.active) {
        return tool === "complete_stage"
            ? {
                  ok: true,
                  data: { ignored: true } satisfies AgentCompleteResult,
              }
            : refuse("AGENT_RUN_CLOSED", HTTP_STATUS.CONFLICT);
    }
    return await runTool(tool, parsed.data, ctx);
}
