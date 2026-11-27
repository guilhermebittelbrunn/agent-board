import type { StageExecutorKind } from "@repo/kanban-contract";
import type {
    BoardAccessDTO,
    BoardDTO,
    BoardViewDTO,
} from "@repo/sdk/src/types";
import { isStorageConfigured } from "./storage";

/** `executor` is resolved for whoever reads the board: it depends on their own runners. */
export const toBoardView = (
    board: BoardDTO,
    access: BoardAccessDTO,
    executor: StageExecutorKind | null
): BoardViewDTO => ({
    ...board,
    access,
    executor,
    storageAvailable: isStorageConfigured(),
});
