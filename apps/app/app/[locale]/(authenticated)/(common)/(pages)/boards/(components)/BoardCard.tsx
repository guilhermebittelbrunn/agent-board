import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import type { BoardViewDTO } from "@repo/sdk/src/types";
import Link from "next/link";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { shortSha } from "./shortSha";

type BoardCardProps = {
    board: BoardViewDTO;
    href: string;
    boardsDictionary: BoardsDictionary;
};

export function BoardCard({ board, href, boardsDictionary }: BoardCardProps) {
    const listCopy = boardsDictionary.list;

    return (
        <Link
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={href}
        >
            <Card className="h-full gap-2 p-5 transition-colors hover:border-primary">
                <div className="flex items-start justify-between gap-2">
                    <span className="break-words font-semibold">
                        {board.name}
                    </span>
                    <Badge variant="secondary">
                        {boardsDictionary.roles[board.access.role]}
                    </Badge>
                </div>
                <span className="break-words text-muted-foreground text-sm">
                    {board.repository.fullName}
                </span>
                <span className="text-muted-foreground text-xs">
                    {fillMessage(listCopy.stagesCount, {
                        count: board.config.stages.length,
                    })}
                    {" · "}
                    {fillMessage(listCopy.readFrom, {
                        ref: board.configSource.ref,
                        sha: shortSha(board.configSource.sha),
                    })}
                </span>
            </Card>
        </Link>
    );
}
