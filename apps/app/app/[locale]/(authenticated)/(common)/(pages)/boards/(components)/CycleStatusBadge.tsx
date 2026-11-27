import { Badge } from "@repo/design-system/components/ui/badge";
import type { CycleStatus } from "@repo/kanban-contract";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

const VARIANT = {
    queued: "outline",
    running: "default",
    finished: "secondary",
    stopped: "destructive",
} as const;

export function CycleStatusBadge({
    status,
    boardsDictionary,
}: {
    status: CycleStatus;
    boardsDictionary: BoardsDictionary;
}) {
    return (
        <Badge variant={VARIANT[status]}>
            {boardsDictionary.cycles.status[status]}
        </Badge>
    );
}
