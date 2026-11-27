import {
    type Answer,
    type AskInput,
    type AttachArtifactInput,
    type BoardConfig,
    type CardEventAuthor,
    type CompleteStageInput,
    findStageConfig,
    type PostUpdateInput,
    type ResolvedAnswer,
    resolveAnswers,
} from "@repo/kanban-contract";
import type { CardDTO, CardEventDTO, UserDTO } from "@repo/sdk/src/types";
import type { CardEventWrite } from "@/(shared)/mappers/card-event.mapper";

export type AgentEventInput =
    | { tool: "post_update"; input: PostUpdateInput }
    | { tool: "ask"; input: AskInput }
    | { tool: "attach_artifact"; input: AttachArtifactInput }
    | { tool: "complete_stage"; input: CompleteStageInput };

export type AgentEventResult =
    | { ok: true; write: CardEventWrite }
    | {
          ok: false;
          code: "CARD_STAGE_NOT_FOUND" | "CARD_ARTIFACT_PATH_INVALID";
      };

/**
 * A path inside the repository, without leading slash, `.` or `..` segments, so it can be
 * joined to a GitHub blob URL without pointing outside the repository.
 */
export function normalizeArtifactPath(path: string): string | null {
    const trimmed = path.trim();
    if (trimmed === "" || trimmed.startsWith("/") || trimmed.includes("\\")) {
        return null;
    }
    const segments = trimmed.split("/").filter((segment) => segment !== "");
    if (
        segments.length === 0 ||
        segments.some((segment) => segment === "." || segment === "..")
    ) {
        return null;
    }
    return segments.join("/");
}

/**
 * Turns the input of an agent tool, already validated with the contract schema, into the
 * event it writes on the card. It never changes where the card sits nor its state.
 */
export function agentEventFromTool(
    event: AgentEventInput,
    ctx: { card: Pick<CardDTO, "id" | "boardId" | "lane">; config: BoardConfig }
): AgentEventResult {
    const stage = findStageConfig(ctx.config, event.input.stage);
    if (stage === undefined) {
        return { ok: false, code: "CARD_STAGE_NOT_FOUND" };
    }
    const base = {
        boardId: ctx.card.boardId,
        cardId: ctx.card.id,
        stageKey: stage.key,
        lane: ctx.card.lane,
        author: {
            kind: "agent",
            name: stage.agent ?? stage.command,
        } satisfies CardEventAuthor,
    };

    switch (event.tool) {
        case "post_update":
            return {
                ok: true,
                write: {
                    ...base,
                    type: "update",
                    markdown: event.input.markdown,
                },
            };
        case "ask":
            return {
                ok: true,
                write: {
                    ...base,
                    type: "question",
                    questions: event.input.questions,
                },
            };
        case "attach_artifact": {
            const path = normalizeArtifactPath(event.input.path);
            if (path === null) {
                return { ok: false, code: "CARD_ARTIFACT_PATH_INVALID" };
            }
            return {
                ok: true,
                write: {
                    ...base,
                    type: "artifact",
                    artifact: { path, commitSha: event.input.commitSha },
                },
            };
        }
        default:
            return {
                ok: true,
                write: {
                    ...base,
                    type: "report",
                    markdown: event.input.summary,
                    outcome: event.input.outcome,
                },
            };
    }
}

export function personAuthor(profile: UserDTO): CardEventAuthor {
    return {
        kind: "person",
        userId: profile.id,
        login: profile.github?.login ?? "",
    };
}

export type AnswerRefusal =
    | "CARD_NOT_FOUND"
    | "CARD_QUESTIONS_NOT_PENDING"
    | "CARD_ANSWERS_MISMATCH";

export type AnswerPlan =
    | { ok: true; stageKey: string; answers: ResolvedAnswer[] }
    | { ok: false; code: AnswerRefusal };

/**
 * Decides whether a person's answers close the card's pending questions. Only the question
 * the card still points at can be answered, so a second answer, or one to questions an
 * agent has since replaced, is refused.
 */
export function planAnswer(input: {
    card: Pick<CardDTO, "id" | "pendingAsk"> | null;
    question: CardEventDTO | null;
    questionEventId: string;
    answers: Answer[];
}): AnswerPlan {
    const { card, question, questionEventId } = input;
    if (card === null) {
        return { ok: false, code: "CARD_NOT_FOUND" };
    }
    if (
        card.pendingAsk === null ||
        card.pendingAsk.eventId !== questionEventId ||
        question === null ||
        question.cardId !== card.id ||
        question.type !== "question"
    ) {
        return { ok: false, code: "CARD_QUESTIONS_NOT_PENDING" };
    }
    const resolved = resolveAnswers(question.questions, input.answers);
    if (!resolved.ok) {
        return { ok: false, code: "CARD_ANSWERS_MISMATCH" };
    }
    return {
        ok: true,
        stageKey: card.pendingAsk.stageKey,
        answers: resolved.answers,
    };
}
