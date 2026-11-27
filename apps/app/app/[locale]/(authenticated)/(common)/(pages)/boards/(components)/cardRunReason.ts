import {
    type BoardConfig,
    findPullRequestStage,
    isAwaitingApproval,
} from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { stageColumnName } from "./stageColumnName";

/** Why the card is where it is, from its last run; `null` when the state says enough. */
export function cardRunReason(
    card: CardDTO,
    config: Pick<BoardConfig, "limits" | "stages">,
    boardsDictionary: BoardsDictionary
): string | null {
    const reasonCopy = boardsDictionary.board.card.runReason;
    const { lastRun } = card;
    if (
        card.activeRunId !== null ||
        lastRun === null ||
        !(card.lane === "stage" || card.lane === "drafts")
    ) {
        return null;
    }
    if (isAwaitingApproval(card)) {
        return reasonCopy.awaitingApproval;
    }
    if (lastRun.stageKey !== card.stageKey) {
        return null;
    }
    if (lastRun.endReason === "stopped") {
        return fillMessage(reasonCopy.stopped, {
            login: lastRun.stoppedByLogin ?? "",
        });
    }
    const waitsForMerge =
        card.state === "idle" &&
        lastRun.outcome === "success" &&
        card.pullRequest?.state === "open" &&
        card.stageKey === findPullRequestStage(config)?.key;
    if (waitsForMerge) {
        return reasonCopy.awaitingMerge;
    }
    if (card.state !== "failed") {
        return null;
    }
    if (lastRun.endReason === "timeout") {
        return fillMessage(reasonCopy.timeout, {
            minutes: config.limits.stageTimeoutMinutes,
        });
    }
    if (lastRun.endReason === "dispatch_failed") {
        return reasonCopy.dispatchFailed;
    }
    if (lastRun.endReason === "no_runner") {
        return reasonCopy.noRunner;
    }
    if (lastRun.endReason === "no_credential") {
        return fillMessage(reasonCopy.noCredential, {
            column:
                stageColumnName(config, lastRun.stageKey, boardsDictionary) ??
                lastRun.stageKey,
        });
    }
    return null;
}
