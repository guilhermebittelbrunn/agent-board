import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { requireAgentApi } from "@/(shared)/lib/agent-contract/agent-guard";
import {
    handleMcpMessage,
    JSON_RPC_ERROR,
    jsonRpcError,
} from "@/(shared)/lib/agent-contract/mcp";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";

/** The `kanban` MCP server over Streamable HTTP: one JSON response per POST, no session. */
export const POST = requireAgentApi(async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return Response.json(
            jsonRpcError(null, JSON_RPC_ERROR.PARSE_ERROR, "Parse error"),
            { status: body.response.status }
        );
    }
    const answer = await handleMcpMessage(
        body.value,
        {
            protocolVersion: req.headers.get("mcp-protocol-version"),
            method: req.headers.get("mcp-method"),
            name: req.headers.get("mcp-name"),
        },
        ctx
    );
    return answer.body === null
        ? new Response(null, { status: answer.status })
        : Response.json(answer.body, { status: answer.status });
});

/** No standalone SSE stream and no session to delete. */
export function GET(): Response {
    return new Response(null, {
        status: HTTP_STATUS.METHOD_NOT_ALLOWED,
        headers: { Allow: "POST" },
    });
}

export const DELETE = GET;
