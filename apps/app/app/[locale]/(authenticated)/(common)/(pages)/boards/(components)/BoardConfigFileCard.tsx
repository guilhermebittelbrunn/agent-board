import { Badge } from "@repo/design-system/components/ui/badge";
import {
    Button,
    buttonVariants,
} from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import type { BoardImportPreviewDTO } from "@repo/sdk/src/types";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { BoardConfigIssues } from "./BoardConfigIssues";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { githubFileUrl } from "./githubFileUrl";
import { shortSha } from "./shortSha";

const BOARD_CONFIG_PATH = ".kanban/board.yml";

type BoardConfigFileCardProps = {
    preview: BoardImportPreviewDTO;
    isFetching: boolean;
    onReadAgain: () => void;
    boardsDictionary: BoardsDictionary;
};

export function BoardConfigFileCard({
    preview,
    isFetching,
    onReadAgain,
    boardsDictionary,
}: BoardConfigFileCardProps) {
    const readConfigCopy = boardsDictionary.wizard.readConfig;
    const { repository, file, issues, status } = preview;
    const ref = file?.ref ?? repository.defaultBranch;
    const errorCount = issues.length;

    return (
        <Card className="gap-4 p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-semibold">
                    {file?.path ?? BOARD_CONFIG_PATH}
                </span>
                {file ? (
                    <span className="font-mono text-muted-foreground text-xs">
                        {fillMessage(readConfigCopy.fileAt, {
                            ref,
                            sha: shortSha(file.sha),
                        })}
                    </span>
                ) : null}
                {status === "invalid" ? (
                    <Badge className="ml-auto" variant="destructive">
                        {errorCount === 1
                            ? readConfigCopy.errorCountOne
                            : fillMessage(readConfigCopy.errorCountOther, {
                                  count: errorCount,
                              })}
                    </Badge>
                ) : null}
            </div>

            {status === "invalid" ? (
                <BoardConfigIssues
                    boardsDictionary={boardsDictionary}
                    issues={issues}
                />
            ) : null}
            {status === "missing" ? (
                <p className="rounded-lg bg-muted p-3 text-sm">
                    {fillMessage(readConfigCopy.missing, { ref })}
                </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
                <Button
                    loading={isFetching}
                    onClick={onReadAgain}
                    type="button"
                    variant={status === "valid" ? "outline" : "default"}
                >
                    {isFetching ? null : <RefreshCwIcon />}
                    {readConfigCopy.readAgain}
                </Button>
                {file ? (
                    <a
                        className={buttonVariants({ variant: "outline" })}
                        href={githubFileUrl(
                            repository.owner,
                            repository.name,
                            ref,
                            file.path
                        )}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        <ExternalLinkIcon />
                        {readConfigCopy.openOnGithub}
                    </a>
                ) : null}
            </div>
        </Card>
    );
}
