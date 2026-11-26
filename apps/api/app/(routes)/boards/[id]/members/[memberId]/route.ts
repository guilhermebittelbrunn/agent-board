import { canChangeMember, canGrantRole } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import {
    type BoardMemberRecord,
    effectiveRoleOf,
    toBoardMemberDTO,
} from "@/(shared)/mappers/board-member.mapper";
import { boardMemberRepository } from "@/(shared)/repositories/board-member.repository";
import { parseUpdateBoardMember } from "@/(shared)/validation/board-member.schema";
import { type BoardAuthContext, requireBoardApi } from "@/app/(guards)/board";

type MemberRouteParams = { id: string; memberId: string };

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

type TargetLookup =
    | { ok: true; target: BoardMemberRecord }
    | { ok: false; response: Response };

/** The member to change, refused when it is on another board or out of the actor's reach. */
async function findChangeableTarget(
    ctx: BoardAuthContext & { params: MemberRouteParams }
): Promise<TargetLookup> {
    const target = await boardMemberRepository.findById(ctx.params.memberId);
    if (!target || target.boardId !== ctx.board.id) {
        return {
            ok: false,
            response: errorResponse(
                "BOARD_MEMBER_NOT_FOUND",
                HTTP_STATUS.NOT_FOUND
            ),
        };
    }
    const actor = { id: ctx.member.id, role: ctx.access.effectiveRole };
    if (!canChangeMember(actor, target)) {
        return {
            ok: false,
            response: errorResponse(
                "BOARD_MEMBER_CHANGE_FORBIDDEN",
                HTTP_STATUS.FORBIDDEN
            ),
        };
    }
    return { ok: true, target };
}

export const PATCH = requireBoardApi<MemberRouteParams>(
    "manageMembers",
    async (req, ctx) => {
        const parsedBody = await parseRequestJson(req);
        if (!parsedBody.ok) {
            return parsedBody.response;
        }
        const parsed = parseUpdateBoardMember(parsedBody.value);
        if (!parsed.ok) {
            return parsed.response;
        }

        const lookup = await findChangeableTarget(ctx);
        if (!lookup.ok) {
            return lookup.response;
        }
        const { role } = parsed.value;
        if (!canGrantRole(ctx.access.effectiveRole, role)) {
            return errorResponse(
                "BOARD_MEMBER_CHANGE_FORBIDDEN",
                HTTP_STATUS.FORBIDDEN
            );
        }

        await boardMemberRepository.updateRole(lookup.target.id, role);
        const updated: BoardMemberRecord = {
            ...lookup.target,
            role,
            effectiveRole: effectiveRoleOf(role, lookup.target.githubRole),
        };
        return Response.json({
            data: toBoardMemberDTO(updated, ctx.member.id),
        });
    }
);

export const DELETE = requireBoardApi<MemberRouteParams>(
    "manageMembers",
    async (_req, ctx) => {
        const lookup = await findChangeableTarget(ctx);
        if (!lookup.ok) {
            return lookup.response;
        }
        await boardMemberRepository.remove(lookup.target.id);
        return new Response(null, { status: 204 });
    }
);
