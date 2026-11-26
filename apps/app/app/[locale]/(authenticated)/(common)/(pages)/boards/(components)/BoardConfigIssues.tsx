import type { BoardConfigIssue } from "@repo/kanban-contract";
import { TriangleAlertIcon } from "lucide-react";
import {
    type BoardsDictionary,
    boardConfigIssueMessage,
} from "./boardConfigIssueMessage";

type BoardConfigIssuesProps = {
    issues: BoardConfigIssue[];
    boardsDictionary: BoardsDictionary;
};

export function BoardConfigIssues({
    issues,
    boardsDictionary,
}: BoardConfigIssuesProps) {
    const issueMessages = boardsDictionary.issues;

    return (
        <ul className="flex flex-col gap-2">
            {issues.map((issue, index) => (
                <li
                    className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm"
                    key={`${issue.path}-${issue.rule}-${index}`}
                >
                    <span className="flex items-center gap-2 font-mono font-semibold text-destructive text-xs">
                        <TriangleAlertIcon
                            aria-label={issueMessages.alertAria}
                            className="size-4 shrink-0"
                            role="img"
                        />
                        {issue.path || issueMessages.wholeFile}
                    </span>
                    <span>{boardConfigIssueMessage(issue, issueMessages)}</span>
                </li>
            ))}
        </ul>
    );
}
