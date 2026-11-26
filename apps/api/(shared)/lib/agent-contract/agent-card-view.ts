import {
    type AgentAnsweredQuestion,
    type AgentArtifactRef,
    type AgentCardView,
    displayCardState,
} from "@repo/kanban-contract";
import { specBody } from "@repo/kanban-contract/spec-frontmatter";
import type { BoardDTO, CardEventDTO } from "@repo/sdk/src/types";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { getGithubClient } from "@/(shared)/lib/github/github-client";
import type { CardRecord } from "@/(shared)/mappers/card.mapper";
import type { RunRecord } from "@/(shared)/mappers/run.mapper";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";

type SpecRead = { sha: string | null; content: string | null };

const UNREAD_SPEC: SpecRead = { sha: null, content: null };

/**
 * The agent has the repository checked out and can read the spec from there, so a GitHub
 * that is not configured or fails leaves the content empty instead of failing the call.
 */
async function readSpec(
    board: BoardDTO,
    card: CardRecord,
    runId: string
): Promise<SpecRead> {
    const client = getGithubClient();
    if (client === null) {
        logEvent("agent", "spec_unavailable", { runId, reason: "no_client" });
        return UNREAD_SPEC;
    }
    try {
        const file = await client.readFile(
            board.repository,
            card.spec.path,
            board.config.baseBranch
        );
        return file
            ? { sha: file.sha, content: specBody(file.content) }
            : UNREAD_SPEC;
    } catch (error) {
        logEvent("agent", "spec_unavailable", {
            runId,
            reason: error instanceof Error ? error.name : "unknown",
        });
        return UNREAD_SPEC;
    }
}

export function answeredQuestionsOf(
    events: CardEventDTO[]
): AgentAnsweredQuestion[] {
    return events.flatMap((event) =>
        event.type === "answer"
            ? [
                  {
                      questionEventId: event.questionEventId,
                      stageKey: event.stageKey,
                      answeredAt: event.createdAt,
                      answers: event.answers,
                  },
              ]
            : []
    );
}

export function artifactsOf(events: CardEventDTO[]): AgentArtifactRef[] {
    return events.flatMap((event) =>
        event.type === "artifact"
            ? [
                  {
                      stageKey: event.stageKey,
                      path: event.artifact.path,
                      commitSha: event.artifact.commitSha,
                      createdAt: event.createdAt,
                  },
              ]
            : []
    );
}

export async function buildAgentCardView(input: {
    run: RunRecord;
    board: BoardDTO;
    card: CardRecord;
}): Promise<AgentCardView> {
    const { run, board, card } = input;
    const [spec, events] = await Promise.all([
        readSpec(board, card, run.id),
        cardEventRepository.listByCard(card.id),
    ]);
    return {
        card: {
            id: card.id,
            boardId: card.boardId,
            slug: card.slug,
            title: card.title,
            lane: card.lane,
            stageKey: card.stageKey,
            state: displayCardState(card),
            reworkLoops: card.reworkLoops,
            branch: card.branch,
        },
        run: {
            id: run.id,
            stageKey: run.stageKey,
            command: run.command,
            model: run.model,
            effort: run.effort,
            maxTurns: run.maxTurns,
            branch: run.branch,
            deadlineAt: run.deadlineAt,
        },
        repository: {
            owner: board.repository.owner,
            name: board.repository.name,
            baseBranch: board.config.baseBranch,
        },
        spec: {
            path: card.spec.path,
            ref: board.config.baseBranch,
            ...spec,
        },
        pendingAsk: card.pendingAsk,
        answers: answeredQuestionsOf(events),
        artifacts: artifactsOf(events),
    };
}
