import type { BoardViewDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    BOARD_CONFIG_PATH,
    boardIdForRepository,
    resolveImportTarget,
    toBoardRepository,
} from "@/(shared)/lib/board-import";
import { listBoardsOf } from "@/(shared)/lib/board-list";
import { toBoardView } from "@/(shared)/lib/board-view";
import { resolveExecutorFor } from "@/(shared)/lib/orchestrator/executor-choice";
import { parseRequestJson } from "@/(shared)/lib/parse-request-json";
import {
    boardMemberMapper,
    ownerMemberWrite,
    toBoardAccess,
} from "@/(shared)/mappers/board-member.mapper";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { parseCreateBoard } from "@/(shared)/validation/board.schema";
import { requireSessionApi } from "@/app/(guards)/session";

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

export const GET = requireSessionApi(async (_req, ctx) => {
    const boards = await listBoardsOf(ctx.profile);
    return Response.json({ data: boards });
});

export const POST = requireSessionApi(async (req, ctx) => {
    const parsedBody = await parseRequestJson(req);
    if (!parsedBody.ok) {
        return parsedBody.response;
    }
    const parsed = parseCreateBoard(parsedBody.value);
    if (!parsed.ok) {
        return parsed.response;
    }

    const profile = ctx.profile;
    const target = await resolveImportTarget(profile, parsed.value.repository);
    if (!target.ok) {
        return target.response;
    }

    const { file, parsed: config, repository } = target;
    if (!(file && config)) {
        return errorResponse(
            "BOARD_CONFIG_NOT_FOUND",
            HTTP_STATUS.UNPROCESSABLE_ENTITY
        );
    }
    if (!config.ok) {
        return errorResponse(
            "BOARD_CONFIG_INVALID",
            HTTP_STATUS.UNPROCESSABLE_ENTITY
        );
    }

    const github = profile.github;
    if (!github) {
        return errorResponse(
            "BOARD_GITHUB_ACCOUNT_REQUIRED",
            HTTP_STATUS.FORBIDDEN
        );
    }
    const boardId = boardIdForRepository(repository.fullName);
    const createdAt = new Date();
    const ownerMember = ownerMemberWrite(
        boardId,
        { userId: profile.id, github },
        target.githubRole,
        createdAt
    );

    const created = await boardRepository.createForRepository(
        boardId,
        {
            ownerUserId: profile.id,
            ownerGithubId: github.id,
            name: config.config.name,
            repository: toBoardRepository(repository),
            config: config.config,
            configSource: {
                path: BOARD_CONFIG_PATH,
                ref: repository.defaultBranch,
                sha: file.sha,
                readAt: createdAt,
            },
        },
        ownerMember
    );
    if (!created) {
        return errorResponse("BOARD_ALREADY_EXISTS", HTTP_STATUS.CONFLICT);
    }

    const owner = boardMemberMapper.toDTO({
        id: ownerMember.id,
        ...ownerMember.document,
    });
    const view: BoardViewDTO = toBoardView(
        created,
        toBoardAccess(owner),
        await resolveExecutorFor(profile.id)
    );
    return Response.json({ data: view }, { status: HTTP_STATUS.CREATED });
});
