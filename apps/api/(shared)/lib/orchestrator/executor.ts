import type { StageExecutor, StageExecutorKind } from "@repo/kanban-contract";
import db from "@/(shared)/infra/database";
import { cardEventRepository } from "@/(shared)/repositories/card-event.repository";
import { resolveStageExecutorMode } from "./executor-mode";
import {
    claimOutcome,
    createFakeExecutor,
    FAKE_EXECUTOR_SCRIPT_TABLE,
    type FakeOutcome,
    toFakeScript,
} from "./fake-executor";
import { createLocalExecutor } from "./local-executor";

async function claimFromScript(
    cardId: string,
    runId: string
): Promise<FakeOutcome | null> {
    const ref = db.collection(FAKE_EXECUTOR_SCRIPT_TABLE).doc(cardId);
    return await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const claimed = claimOutcome(toFakeScript(snapshot.data()), runId);
        if (claimed === null) {
            return null;
        }
        transaction.set(ref, claimed.script);
        return claimed.outcome;
    });
}

let fakeExecutor: StageExecutor | null = null;
const localExecutor = createLocalExecutor();

export function getStageExecutor(
    kind: StageExecutorKind
): StageExecutor | null {
    if (kind === "local") {
        return localExecutor;
    }
    if (resolveStageExecutorMode({ hasOnlineRunner: false }) !== "fake") {
        return null;
    }
    fakeExecutor ??= createFakeExecutor({
        claim: claimFromScript,
        async note(input, markdown) {
            await cardEventRepository.appendAgentEvent(
                { id: input.cardId },
                {
                    boardId: input.boardId,
                    cardId: input.cardId,
                    stageKey: input.stageKey,
                    lane: "stage",
                    type: "update",
                    author: {
                        kind: "agent",
                        name: input.agent ?? input.command,
                    },
                    markdown,
                    runId: input.runId,
                }
            );
        },
    });
    return fakeExecutor;
}
