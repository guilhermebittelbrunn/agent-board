import { diffBoardStages } from "@repo/kanban-contract";
import type { BoardReloadResultDTO, BoardViewDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    BOARD_CONFIG_PATH,
    resolveImportTarget,
    toBoardRepository,
} from "@/(shared)/lib/board-import";
import { toBoardView } from "@/(shared)/lib/board-view";
import { resolveExecutorFor } from "@/(shared)/lib/orchestrator/executor-choice";
import { toStageSettings } from "@/(shared)/mappers/board.mapper";
import { boardRepository } from "@/(shared)/repositories/board.repository";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { requireBoardApi } from "@/app/(guards)/board";

const result = (data: BoardReloadResultDTO) => Response.json({ data });

/** A card left in a stage the new file drops would sit in a column that no longer exists. */
async function removesColumnWithCards(
    boardId: string,
    removed: { key: string }[]
): Promise<boolean> {
    if (removed.length === 0) {
        return false;
    }
    const removedKeys = new Set(removed.map((stage) => stage.key));
    const cards = await cardRepository.listByBoard(boardId);
    return cards.some(
        (card) =>
            card.lane === "stage" &&
            card.stageKey !== null &&
            removedKeys.has(card.stageKey)
    );
}

export const POST = requireBoardApi("configure", async (_req, ctx) => {
    const board: BoardViewDTO = toBoardView(
        ctx.board,
        ctx.access,
        await resolveExecutorFor(ctx.subjectProfile.id)
    );
    const { id } = board;

    const target = await resolveImportTarget(
        ctx.subjectProfile,
        board.repository.fullName
    );
    if (!target.ok) {
        return target.response;
    }

    const { file, parsed, repository } = target;
    if (!(file && parsed)) {
        return result({
            outcome: "missing",
            board,
            changes: null,
            issues: [],
        });
    }
    if (!parsed.ok) {
        return result({
            outcome: "invalid",
            board,
            changes: null,
            issues: parsed.issues,
        });
    }
    if (file.sha === board.configSource.sha) {
        return result({
            outcome: "unchanged",
            board,
            changes: null,
            issues: [],
        });
    }

    const changes = diffBoardStages(board.config.stages, parsed.config.stages);
    if (await removesColumnWithCards(id, changes.removed)) {
        return Response.json(
            { error: { code: "BOARD_RELOAD_STAGE_HAS_CARDS" } },
            { status: HTTP_STATUS.CONFLICT }
        );
    }

    const readAt = new Date();
    const patch = {
        name: parsed.config.name,
        repository: toBoardRepository(repository),
        config: parsed.config,
        configSource: {
            path: BOARD_CONFIG_PATH,
            ref: repository.defaultBranch,
            sha: file.sha,
            readAt,
        },
    };
    await boardRepository.applyReload(id, patch);

    const updated: BoardViewDTO = {
        ...board,
        ...patch,
        configSource: {
            ...patch.configSource,
            readAt: readAt.toISOString(),
        },
        stageSettings: toStageSettings(board.stageSettings, parsed.config),
        updatedAt: readAt.toISOString(),
    };
    return result({
        outcome: "updated",
        board: updated,
        changes,
        issues: [],
    });
});
