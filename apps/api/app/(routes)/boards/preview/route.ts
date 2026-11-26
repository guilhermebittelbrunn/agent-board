import {
    boardIdForRepository,
    resolveImportTarget,
    toImportPreview,
} from "@/(shared)/lib/board-import";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { parseBoardPreviewQuery } from "@/(shared)/validation/board.schema";
import { requireCommonPanelApi } from "@/app/(guards)/common-panel";

export const GET = requireCommonPanelApi(async (req, ctx) => {
    const query = parseBoardPreviewQuery(req);
    if (!query.ok) {
        return query.response;
    }

    const target = await resolveImportTarget(
        ctx.subjectProfile,
        query.value.repository
    );
    if (!target.ok) {
        return target.response;
    }

    const id = boardIdForRepository(target.repository.fullName);
    const links = await boardRepository.linksFor([id], ctx.subjectProfile.id);

    return Response.json({
        data: toImportPreview(target, links.get(id) ?? null),
    });
});
