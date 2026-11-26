import type { StageConfig } from "./boardConfig";

export const STAGE_FIELDS = [
    "column",
    "command",
    "agent",
    "model",
    "effort",
    "runners",
    "approval",
    "onRework",
    "onPrComment",
] as const;

export type StageField = (typeof STAGE_FIELDS)[number];

export type BoardStageRef = { key: string; column: string };

export type BoardStagesDiff = {
    added: BoardStageRef[];
    removed: BoardStageRef[];
    changed: (BoardStageRef & { fields: StageField[] })[];
    moved: boolean;
};

const sameValue = (left: unknown, right: unknown): boolean =>
    Array.isArray(left) && Array.isArray(right)
        ? left.length === right.length &&
          left.every((item, index) => item === right[index])
        : left === right;

export function isEmptyStagesDiff(diff: BoardStagesDiff): boolean {
    return (
        diff.added.length === 0 &&
        diff.removed.length === 0 &&
        diff.changed.length === 0 &&
        !diff.moved
    );
}

/**
 * Stages are matched by `key`, the identity a card keeps across reloads; the column title
 * is just one more field that can change. `moved` only compares the stages present on
 * both sides, so adding or removing a stage does not count as a reorder.
 */
export function diffBoardStages(
    previousStages: readonly StageConfig[],
    nextStages: readonly StageConfig[]
): BoardStagesDiff {
    const beforeByKey = new Map(
        previousStages.map((stage) => [stage.key, stage])
    );
    const afterKeys = new Set(nextStages.map((stage) => stage.key));

    const added = nextStages
        .filter((stage) => !beforeByKey.has(stage.key))
        .map(({ key, column }) => ({ key, column }));
    const removed = previousStages
        .filter((stage) => !afterKeys.has(stage.key))
        .map(({ key, column }) => ({ key, column }));

    const changed: BoardStagesDiff["changed"] = [];
    for (const stage of nextStages) {
        const previous = beforeByKey.get(stage.key);
        if (!previous) {
            continue;
        }
        const fields = STAGE_FIELDS.filter(
            (field) => !sameValue(previous[field], stage[field])
        );
        if (fields.length > 0) {
            changed.push({ key: stage.key, column: stage.column, fields });
        }
    }

    const keptBefore = previousStages
        .map((stage) => stage.key)
        .filter((key) => afterKeys.has(key));
    const keptAfter = nextStages
        .map((stage) => stage.key)
        .filter((key) => beforeByKey.has(key));
    const moved = keptBefore.some((key, index) => keptAfter[index] !== key);

    return { added, removed, changed, moved };
}
