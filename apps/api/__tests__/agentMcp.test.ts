import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "@/(shared)/lib/agent-contract/agent-context";
import type { McpRequestHeaders } from "@/(shared)/lib/agent-contract/mcp";

const { callAgentToolMock } = vi.hoisted(() => ({
    callAgentToolMock: vi.fn(),
}));

vi.mock("@/(shared)/lib/agent-contract/agent-tools", () => ({
    callAgentTool: (...args: unknown[]) => callAgentToolMock(...args),
}));

const { handleMcpMessage, JSON_RPC_ERROR, MCP_PROTOCOL_VERSIONS, mcpToolList } =
    await import("@/(shared)/lib/agent-contract/mcp");

const ctx = {} as AgentContext;
const MODERN = "2026-07-28";
const NO_HEADERS: McpRequestHeaders = {
    protocolVersion: null,
    method: null,
    name: null,
};

const legacy = (method: string, params?: unknown, id: unknown = 1) =>
    handleMcpMessage(
        { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) },
        NO_HEADERS,
        ctx
    );

const modernMeta = (version = MODERN) => ({
    "io.modelcontextprotocol/protocolVersion": version,
    "io.modelcontextprotocol/clientInfo": { name: "claude-code", version: "x" },
    "io.modelcontextprotocol/clientCapabilities": {},
});

const modern = (
    method: string,
    params: Record<string, unknown> = {},
    headers: Partial<McpRequestHeaders> = {}
) =>
    handleMcpMessage(
        {
            jsonrpc: "2.0",
            id: 7,
            method,
            params: { ...params, _meta: modernMeta() },
        },
        {
            protocolVersion: MODERN,
            method,
            name: typeof params.name === "string" ? params.name : null,
            ...headers,
        },
        ctx
    );

beforeEach(() => {
    callAgentToolMock.mockReset();
    callAgentToolMock.mockResolvedValue({ ok: true, data: { eventId: "e1" } });
});

describe("MCP, handshake era (2025-11-25 and earlier)", () => {
    it("echoes a known version on initialize and offers the newest otherwise", async () => {
        const known = await legacy("initialize", {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "c", version: "1" },
        });
        const unknown = await legacy("initialize", {
            protocolVersion: "2024-11-05",
        });

        expect(known).toEqual({
            status: 200,
            body: {
                jsonrpc: "2.0",
                id: 1,
                result: {
                    protocolVersion: "2025-06-18",
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: "kanban", version: "1.0.0" },
                },
            },
        });
        expect(unknown.body?.result).toMatchObject({
            protocolVersion: "2025-11-25",
        });
    });

    it("accepts a notification with 202 and no body", async () => {
        expect(
            await handleMcpMessage(
                { jsonrpc: "2.0", method: "notifications/initialized" },
                NO_HEADERS,
                ctx
            )
        ).toEqual({ status: 202, body: null });
    });

    it("lists the six tools, without create_card, with the contract limits", async () => {
        const { body } = await legacy("tools/list");
        const tools = (
            body?.result as { tools: ReturnType<typeof mcpToolList> }
        ).tools;

        expect(tools.map((tool) => tool.name)).toEqual([
            "get_card",
            "post_update",
            "ask",
            "attach_artifact",
            "complete_stage",
            "get_attachment",
        ]);
        const ask = tools.find((tool) => tool.name === "ask");
        expect(ask?.inputSchema).toMatchObject({
            type: "object",
            properties: { questions: { maxItems: 4, minItems: 1 } },
        });
    });

    it("returns the tool result as text, and a refusal with isError", async () => {
        const ok = await legacy("tools/call", {
            name: "post_update",
            arguments: { cardId: "c", stage: "analyze", markdown: "x" },
        });
        callAgentToolMock.mockResolvedValueOnce({
            ok: false,
            code: "VALIDATION_FAILED",
            status: 400,
        });
        const refused = await legacy("tools/call", {
            name: "ask",
            arguments: {},
        });

        expect(callAgentToolMock).toHaveBeenCalledWith(
            "post_update",
            { cardId: "c", stage: "analyze", markdown: "x" },
            ctx
        );
        expect(ok.body?.result).toEqual({
            content: [{ type: "text", text: '{"eventId":"e1"}' }],
            isError: false,
        });
        expect(refused.body?.result).toEqual({
            content: [
                {
                    type: "text",
                    text: '{"error":{"code":"VALIDATION_FAILED"}}',
                },
            ],
            isError: true,
        });
    });

    it("answers ping and refuses an unknown method with -32601", async () => {
        expect((await legacy("ping")).body?.result).toEqual({});
        expect((await legacy("resources/list")).body?.error?.code).toBe(
            JSON_RPC_ERROR.METHOD_NOT_FOUND
        );
    });

    it("refuses tools/call without a tool name with -32602", async () => {
        expect(
            (await legacy("tools/call", { arguments: {} })).body?.error?.code
        ).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
        expect(callAgentToolMock).not.toHaveBeenCalled();
    });

    it("refuses a batch, a non JSON-RPC body and a non-object params with -32600", async () => {
        for (const message of [
            [{ jsonrpc: "2.0", id: 1, method: "ping" }],
            { id: 1, method: "ping" },
            { jsonrpc: "2.0", id: 1, method: "ping", params: [] },
            "ping",
        ]) {
            const reply = await handleMcpMessage(message, NO_HEADERS, ctx);

            expect(reply.status).toBe(HTTP_STATUS.BAD_REQUEST);
            expect(reply.body?.error?.code).toBe(
                JSON_RPC_ERROR.INVALID_REQUEST
            );
        }
        expect(callAgentToolMock).not.toHaveBeenCalled();
    });

    it("refuses a request id that is null, an object or a boolean with -32600 and a null id", async () => {
        for (const badId of [null, { n: 1 }, true]) {
            const reply = await handleMcpMessage(
                { jsonrpc: "2.0", id: badId, method: "ping" },
                NO_HEADERS,
                ctx
            );

            expect(reply.status).toBe(HTTP_STATUS.BAD_REQUEST);
            expect(reply.body?.id).toBeNull();
            expect(reply.body?.error?.code).toBe(
                JSON_RPC_ERROR.INVALID_REQUEST
            );
        }
    });

    it("refuses an unknown MCP-Protocol-Version header listing the supported ones", async () => {
        const reply = await handleMcpMessage(
            { jsonrpc: "2.0", id: 1, method: "tools/list" },
            { ...NO_HEADERS, protocolVersion: "1900-01-01" },
            ctx
        );

        expect(reply.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(reply.body?.error).toMatchObject({
            code: JSON_RPC_ERROR.UNSUPPORTED_PROTOCOL_VERSION,
            data: { supported: MCP_PROTOCOL_VERSIONS, requested: "1900-01-01" },
        });
    });
});

describe("MCP, per-request era (2026-07-28)", () => {
    it("answers server/discover with the versions and the tools capability", async () => {
        const reply = await modern("server/discover");

        expect(reply.status).toBe(HTTP_STATUS.OK);
        expect(reply.body?.result).toEqual({
            resultType: "complete",
            supportedVersions: MCP_PROTOCOL_VERSIONS,
            capabilities: { tools: {} },
            _meta: {
                "io.modelcontextprotocol/serverInfo": {
                    name: "kanban",
                    version: "1.0.0",
                },
            },
        });
    });

    it("calls a tool and marks the result complete", async () => {
        const reply = await modern("tools/call", {
            name: "post_update",
            arguments: { cardId: "c", stage: "analyze", markdown: "x" },
        });

        expect(reply.body?.result).toMatchObject({
            resultType: "complete",
            content: [{ type: "text", text: '{"eventId":"e1"}' }],
            isError: false,
        });
    });

    it("decodes a base64 Mcp-Name before comparing it to the body", async () => {
        const reply = await modern(
            "tools/call",
            { name: "get_card", arguments: { cardId: "c" } },
            {
                name: `=?base64?${Buffer.from("get_card").toString("base64")}?=`,
            }
        );

        expect(reply.status).toBe(HTTP_STATUS.OK);
    });

    it.each([
        ["a version header that differs", { protocolVersion: "2025-11-25" }],
        ["a missing Mcp-Method", { method: null }],
        ["an Mcp-Name that differs", { name: "ask" }],
    ])("refuses %s with HeaderMismatch", async (_label, headers) => {
        const reply = await modern(
            "tools/call",
            { name: "get_card", arguments: { cardId: "c" } },
            headers
        );

        expect(reply.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(reply.body?.error?.code).toBe(JSON_RPC_ERROR.HEADER_MISMATCH);
        expect(callAgentToolMock).not.toHaveBeenCalled();
    });

    it("refuses a version it does not implement with the supported list", async () => {
        const reply = await handleMcpMessage(
            {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
                params: { _meta: modernMeta("2099-01-01") },
            },
            { protocolVersion: "2099-01-01", method: "tools/list", name: null },
            ctx
        );

        expect(reply.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(reply.body?.error).toMatchObject({
            code: JSON_RPC_ERROR.UNSUPPORTED_PROTOCOL_VERSION,
            data: { supported: MCP_PROTOCOL_VERSIONS, requested: "2099-01-01" },
        });
    });

    it("refuses a request without client capabilities with -32602", async () => {
        const reply = await handleMcpMessage(
            {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
                params: {
                    _meta: {
                        "io.modelcontextprotocol/protocolVersion": MODERN,
                    },
                },
            },
            { protocolVersion: MODERN, method: "tools/list", name: null },
            ctx
        );

        expect(reply.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(reply.body?.error?.code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
    });

    it("answers an unknown method with 404 and -32601", async () => {
        const reply = await modern("resources/list");

        expect(reply.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(reply.body?.error?.code).toBe(JSON_RPC_ERROR.METHOD_NOT_FOUND);
    });
});

describe("MCP, get_attachment content", () => {
    const attachment = (contentType: string, text: string) => ({
        id: "3f0c9e1a-1b2c-4d5e-8f90-123456789abc",
        name: "file",
        contentType,
        size: text.length,
        base64: Buffer.from(text).toString("base64"),
    });
    const callWith = async (data: unknown) => {
        callAgentToolMock.mockResolvedValueOnce({ ok: true, data });
        return (
            await legacy("tools/call", {
                name: "get_attachment",
                arguments: {},
            })
        ).body?.result;
    };

    it("sends an image as image content", async () => {
        expect(await callWith(attachment("image/png", "png"))).toEqual({
            content: [
                {
                    type: "image",
                    data: Buffer.from("png").toString("base64"),
                    mimeType: "image/png",
                },
            ],
            isError: false,
        });
    });

    it("sends text decoded as text content", async () => {
        expect(await callWith(attachment("text/markdown", "# Notas"))).toEqual({
            content: [{ type: "text", text: "# Notas" }],
            isError: false,
        });
    });

    it("sends a PDF as an embedded resource", async () => {
        expect(await callWith(attachment("application/pdf", "%PDF-"))).toEqual({
            content: [
                {
                    type: "resource",
                    resource: {
                        uri: "kanban://attachment/3f0c9e1a-1b2c-4d5e-8f90-123456789abc",
                        mimeType: "application/pdf",
                        blob: Buffer.from("%PDF-").toString("base64"),
                    },
                },
            ],
            isError: false,
        });
    });
});
