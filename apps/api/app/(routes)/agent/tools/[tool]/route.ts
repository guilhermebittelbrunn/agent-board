import { logEvent } from "@repo/shared/utils/helpers/log";
import { requireAgentApi } from "@/(shared)/lib/agent-contract/agent-guard";
import { callAgentTool } from "@/(shared)/lib/agent-contract/agent-tools";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";

type ToolRouteParams = { tool: string };

/** One agent tool per call; the body is the tool's input. */
export const POST = requireAgentApi<ToolRouteParams>(async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const outcome = await callAgentTool(ctx.params.tool, body.value, ctx);
    logEvent("agent", "tool", {
        runId: ctx.run.id,
        tool: ctx.params.tool,
        code: outcome.ok ? null : outcome.code,
    });
    return outcome.ok
        ? Response.json({ data: outcome.data })
        : Response.json(
              { error: { code: outcome.code } },
              { status: outcome.status }
          );
});
