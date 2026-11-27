import type { CardRecord } from "@/(shared)/mappers/card.mapper";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";

/** The board writes these itself: no agent ran, so the author is the board. */
const BOARD_AUTHOR = { kind: "agent", name: "agent-board" } as const;

export const pullRequestEventText = {
    opened: (number: number, draft: boolean) =>
        `PR #${number} aberta${draft ? " como rascunho" : ""}.`,
    adopted: (number: number) =>
        `PR #${number} adotada: já havia uma PR aberta para a branch do card.`,
    openedNotDraft: (number: number) =>
        `PR #${number} aberta pronta para review: o GitHub recusou o rascunho neste repositório.`,
    failed: (code: string) => `Não foi possível abrir a PR (\`${code}\`).`,
    merged: (number: number, login: string) =>
        `PR #${number} mergeada por @${login}.`,
    closed: (number: number, login: string) =>
        `PR #${number} fechada sem merge por @${login}.`,
    commentLimit: (limit: number, command: string) =>
        `Limite de ${limit} ${command} por hora atingido; o comentário novo fica esperando.`,
};

export async function appendBoardUpdate(
    card: Pick<CardRecord, "id" | "boardId" | "lane" | "stageKey">,
    markdown: string
): Promise<void> {
    await cardEventRepository.appendAgentEvent(card, {
        boardId: card.boardId,
        cardId: card.id,
        stageKey: card.stageKey,
        lane: card.lane,
        author: BOARD_AUTHOR,
        type: "update",
        markdown,
    });
}
