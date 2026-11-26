import type { BoardAccessDTO, BoardDTO } from "@repo/sdk/src/types";
import type { NextRequest } from "next/server";
import {
    type BoardCapability,
    resolveBoardAccess,
} from "@/(shared)/lib/board-access";
import type { BoardMemberRecord } from "@/(shared)/mappers/board-member.mapper";
import {
    type CommonPanelAuthContext,
    requireCommonPanelApi,
} from "./common-panel";

export type BoardAuthContext = CommonPanelAuthContext & {
    board: BoardDTO;
    member: BoardMemberRecord;
    access: BoardAccessDTO;
};

type BoardRouteParams = { id: string };

/**
 * Every board route goes through here: the session guard first, then the person's
 * effective role on the board, refused with 404/403 before the handler runs.
 */
export function requireBoardApi<
    TParams extends BoardRouteParams = BoardRouteParams,
>(
    capability: BoardCapability,
    handler: (
        req: NextRequest,
        ctx: BoardAuthContext & { params: TParams }
    ) => Promise<Response>
) {
    type BoardRouteContext = { params: TParams | Promise<TParams> };

    return requireCommonPanelApi<BoardRouteContext>(async (req, ctx) => {
        const params = await ctx.params;
        const resolved = await resolveBoardAccess({
            boardId: params.id,
            profile: ctx.subjectProfile,
            capability,
            isImpersonating: ctx.authRequest.isImpersonating,
        });
        if (!resolved.ok) {
            return resolved.response;
        }
        return handler(req, {
            ...ctx,
            params,
            board: resolved.board,
            member: resolved.member,
            access: resolved.access,
        });
    });
}
