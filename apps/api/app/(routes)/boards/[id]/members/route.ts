import { canGrantRole } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import { toBoardMemberDTO } from "@/(shared)/mappers/board-member.mapper";
import { boardMemberRepository } from "@/(shared)/repositories/board-member.repository";
import { parseInviteBoardMember } from "@/(shared)/validation/board-member.schema";
import { requireBoardApi } from "@/app/(guards)/board";

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

export const GET = requireBoardApi("view", async (_req, ctx) => {
    const members = await boardMemberRepository.listByBoard(ctx.board.id);
    return Response.json({
        data: members.map((member) => toBoardMemberDTO(member, ctx.member.id)),
    });
});

/**
 * The invitation does not ask GitHub: the login is checked when the person signs in, and
 * the role only counts as far as their permission on the repository allows.
 */
export const POST = requireBoardApi("manageMembers", async (req, ctx) => {
    const parsedBody = await parseRequestJson(req);
    if (!parsedBody.ok) {
        return parsedBody.response;
    }
    const parsed = parseInviteBoardMember(parsedBody.value);
    if (!parsed.ok) {
        return parsed.response;
    }
    const { login, role } = parsed.value;

    if (!canGrantRole(ctx.access.effectiveRole, role)) {
        return errorResponse(
            "BOARD_MEMBER_ROLE_NOT_ALLOWED",
            HTTP_STATUS.FORBIDDEN
        );
    }
    if (await boardMemberRepository.findByLogin(ctx.board.id, login)) {
        return errorResponse(
            "BOARD_MEMBER_ALREADY_EXISTS",
            HTTP_STATUS.CONFLICT
        );
    }

    const created = await boardMemberRepository.createMember({
        boardId: ctx.board.id,
        login,
        role,
        invitedByUserId: ctx.subjectProfile.id,
    });
    if (!created) {
        return errorResponse(
            "BOARD_MEMBER_ALREADY_EXISTS",
            HTTP_STATUS.CONFLICT
        );
    }

    return Response.json(
        { data: toBoardMemberDTO(created, ctx.member.id) },
        { status: HTTP_STATUS.CREATED }
    );
});
