"use client";

import { getDictionary } from "@repo/internationalization/client";
import { canTriggerStages } from "@repo/kanban-contract";
import type { BoardViewDTO } from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useState } from "react";
import {
    type ScheduledTaskTarget,
    useBoardCredentialCrud,
} from "../(hooks)/useBoardCredentialCrud";
import { useListBoardCredentials } from "../(hooks)/useListBoardCredentials";
import type { BoardsDictionary } from "./boardConfigIssueMessage";
import { RemoveScheduledTaskDialog } from "./RemoveScheduledTaskDialog";
import { ScheduledTaskDialog } from "./ScheduledTaskDialog";
import { ScheduledTaskTable } from "./ScheduledTaskTable";

type ScheduledTaskSectionProps = {
    board: Pick<BoardViewDTO, "id" | "config" | "access">;
    boardsDictionary: BoardsDictionary;
};

export function ScheduledTaskSection({
    board,
    boardsDictionary,
}: ScheduledTaskSectionProps) {
    const { locale } = getDictionary();
    const { data: credentials, error } = useListBoardCredentials(board.id);
    const { saveMutation, removeMutation } = useBoardCredentialCrud(board.id);
    const [taskToSave, setTaskToSave] = useState<ScheduledTaskTarget | null>(
        null
    );
    const [taskToRemove, setTaskToRemove] =
        useState<ScheduledTaskTarget | null>(null);

    if (error) {
        return (
            <p className="text-destructive text-sm" role="alert">
                {handleClientError(new FormattedError(error, locale))}
            </p>
        );
    }
    if (!credentials) {
        return null;
    }

    return (
        <>
            <ScheduledTaskTable
                board={board}
                boardsDictionary={boardsDictionary}
                canEdit={canTriggerStages(board.access.effectiveRole)}
                credentials={credentials}
                onRemove={setTaskToRemove}
                onSave={setTaskToSave}
            />
            <ScheduledTaskDialog
                boardsDictionary={boardsDictionary}
                isSaving={saveMutation.isPending}
                onClose={() => setTaskToSave(null)}
                onSave={(target, body) =>
                    saveMutation.mutateAsync({ target, body })
                }
                target={taskToSave}
            />
            <RemoveScheduledTaskDialog
                boardsDictionary={boardsDictionary}
                isPending={removeMutation.isPending}
                onCancel={() => setTaskToRemove(null)}
                onConfirm={(target) =>
                    removeMutation.mutate(target, {
                        onSettled: () => setTaskToRemove(null),
                    })
                }
                target={taskToRemove}
            />
        </>
    );
}
