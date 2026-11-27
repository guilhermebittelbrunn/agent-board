import type { ImportableRepositoryDTO } from "@repo/sdk/src/types";
import {
    boardIdForRepository,
    listAdminRepositories,
    toBoardRepository,
} from "@/(shared)/lib/board-import";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { requireSessionApi } from "@/app/(guards)/session";

export const GET = requireSessionApi(async (_req, ctx) => {
    const listed = await listAdminRepositories(ctx.profile);
    if (!listed.ok) {
        return listed.response;
    }

    const ids = listed.repositories.map((repository) =>
        boardIdForRepository(repository.fullName)
    );
    const links = await boardRepository.linksFor(ids, ctx.profile.id);

    const data: ImportableRepositoryDTO[] = listed.repositories.map(
        (repository, index) => ({
            ...toBoardRepository(repository),
            board: links.get(ids[index] ?? "") ?? null,
        })
    );
    return Response.json({ data });
});
