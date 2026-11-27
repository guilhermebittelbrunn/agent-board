import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import type { AgentContext } from "@/(shared)/lib/agent-contract/agent-context";
import {
    isRunTokenExpired,
    matchesRunToken,
} from "@/(shared)/lib/agent-contract/run-token";
import {
    parseRunToken,
    readBearer,
} from "@/(shared)/lib/agent-contract/run-token-format";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { runRepository } from "@/(shared)/repositories/run.repository";

type TokenRefusal = "AGENT_TOKEN_INVALID" | "AGENT_TOKEN_EXPIRED";

const refuseToken = (code: TokenRefusal): Response =>
    Response.json(
        { error: { code } },
        {
            status: HTTP_STATUS.UNAUTHORIZED,
            headers: { "WWW-Authenticate": "Bearer" },
        }
    );

const notFound = (code: "BOARD_NOT_FOUND" | "CARD_NOT_FOUND"): Response =>
    Response.json({ error: { code } }, { status: HTTP_STATUS.NOT_FOUND });

/**
 * Agent routes are called by a Claude Code session, not by a person: no cookie, no
 * session, so the session guard does not fit. The run token proves which run is calling;
 * a missing run and a wrong secret get the same answer, so the token does not reveal
 * which run ids exist.
 */
export function requireAgentApi<TParams = Record<string, never>>(
    handler: (
        req: NextRequest,
        ctx: AgentContext & { params: TParams }
    ) => Promise<Response>
) {
    return async (
        req: NextRequest,
        route: { params: TParams | Promise<TParams> }
    ): Promise<Response> => {
        const parsed = parseRunToken(
            readBearer(req.headers.get("authorization"))
        );
        if (parsed === null) {
            return refuseToken("AGENT_TOKEN_INVALID");
        }
        const stored = await runRepository.findWithToken(parsed.runId);
        if (
            stored === null ||
            !matchesRunToken(parsed.secret, stored.token.tokenHash)
        ) {
            return refuseToken("AGENT_TOKEN_INVALID");
        }
        const now = new Date();
        if (isRunTokenExpired(stored.token.tokenExpiresAt, now)) {
            return refuseToken("AGENT_TOKEN_EXPIRED");
        }

        const { run } = stored;
        const [board, card] = await Promise.all([
            boardRepository.findById(run.boardId),
            cardRepository.findById(run.cardId),
        ]);
        if (board === null) {
            return notFound("BOARD_NOT_FOUND");
        }
        if (card === null || card.boardId !== board.id) {
            return notFound("CARD_NOT_FOUND");
        }
        return handler(req, {
            run,
            board,
            card,
            now,
            params: await route.params,
        });
    };
}
