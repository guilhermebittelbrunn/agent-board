import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@repo/design-system/components/ui/alert";
import type { BoardReloadResultDTO } from "@repo/sdk/src/types";
import { BoardConfigIssues } from "./BoardConfigIssues";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { shortSha } from "./shortSha";

type BoardReloadResultProps = {
    result: BoardReloadResultDTO;
    boardsDictionary: BoardsDictionary;
};

function changeLines(
    result: BoardReloadResultDTO,
    boardsDictionary: BoardsDictionary
): string[] {
    const reloadCopy = boardsDictionary.settings.reloadResult;
    const changes = result.changes;
    if (!changes) {
        return [];
    }
    return [
        ...changes.added.map((stage) =>
            fillMessage(reloadCopy.added, { column: stage.column })
        ),
        ...changes.removed.map((stage) =>
            fillMessage(reloadCopy.removed, { column: stage.column })
        ),
        ...changes.changed.map((stage) =>
            fillMessage(reloadCopy.changed, {
                column: stage.column,
                fields: stage.fields
                    .map((field) => reloadCopy.fields[field])
                    .join(", "),
            })
        ),
        ...(changes.moved ? [reloadCopy.moved] : []),
    ];
}

export function BoardReloadResult({
    result,
    boardsDictionary,
}: BoardReloadResultProps) {
    const reloadCopy = boardsDictionary.settings.reloadResult;
    const source = result.board.configSource;

    if (result.outcome === "invalid") {
        return (
            <Alert variant="destructive">
                <AlertTitle>{reloadCopy.invalid}</AlertTitle>
                <AlertDescription className="w-full text-foreground">
                    <BoardConfigIssues
                        boardsDictionary={boardsDictionary}
                        issues={result.issues}
                    />
                </AlertDescription>
            </Alert>
        );
    }
    if (result.outcome === "missing") {
        return (
            <Alert variant="destructive">
                <AlertTitle>
                    {fillMessage(reloadCopy.missing, {
                        ref: result.board.repository.defaultBranch,
                    })}
                </AlertTitle>
            </Alert>
        );
    }
    if (result.outcome === "unchanged") {
        return (
            <Alert>
                <AlertTitle>
                    {fillMessage(reloadCopy.unchanged, {
                        sha: shortSha(source.sha),
                    })}
                </AlertTitle>
            </Alert>
        );
    }

    const lines = changeLines(result, boardsDictionary);
    return (
        <Alert>
            <AlertTitle>
                {fillMessage(reloadCopy.updated, { sha: shortSha(source.sha) })}
            </AlertTitle>
            {lines.length > 0 ? (
                <AlertDescription>
                    <ul className="list-disc pl-4">
                        {lines.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </AlertDescription>
            ) : null}
        </Alert>
    );
}
