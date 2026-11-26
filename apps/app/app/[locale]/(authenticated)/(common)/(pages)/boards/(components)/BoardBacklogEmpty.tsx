import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import type { BoardViewDTO, CardDTO } from "@repo/sdk/src/types";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type BoardBacklogEmptyProps = {
    board: BoardViewDTO;
    notReady: CardDTO[];
    boardsDictionary: BoardsDictionary;
    cardHref: (slug: string) => string;
    syncAction: ReactNode;
};

const PREVIEW_SIZE = 3;

function foundMessage(
    count: number,
    emptyCopy: BoardsDictionary["board"]["emptyBacklog"]
): string {
    if (count === 0) {
        return emptyCopy.foundNone;
    }
    return count === 1
        ? emptyCopy.foundOne
        : fillMessage(emptyCopy.foundOther, { count });
}

/** The board has no ready spec yet: says why, shows what it found and offers a sync. */
export function BoardBacklogEmpty({
    board,
    notReady,
    boardsDictionary,
    cardHref,
    syncAction,
}: BoardBacklogEmptyProps) {
    const emptyCopy = boardsDictionary.board.emptyBacklog;
    const { index, readyStatus } = board.config.backlog;
    const synced = board.backlogSync !== null;
    const preview = notReady.slice(0, PREVIEW_SIZE);
    const hidden = notReady.length - preview.length;

    return (
        <Card className="max-w-xl gap-4 p-5">
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FileTextIcon aria-hidden className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="font-semibold">
                        {synced ? emptyCopy.title : emptyCopy.neverSyncedTitle}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        {fillMessage(
                            synced ? emptyCopy.body : emptyCopy.neverSyncedBody,
                            { index, readyStatus }
                        )}
                        {synced
                            ? ` ${foundMessage(board.backlogSync?.specCount ?? 0, emptyCopy)}`
                            : null}
                    </p>
                </div>
            </div>
            {preview.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {preview.map((card) => (
                        <li
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                            key={card.id}
                        >
                            <Link
                                className="min-w-0 break-words hover:underline"
                                href={cardHref(card.slug)}
                            >
                                {card.title}
                            </Link>
                            <Badge className="font-mono" variant="secondary">
                                {card.spec.status}
                            </Badge>
                        </li>
                    ))}
                    {hidden > 0 ? (
                        <li className="px-3 py-2 text-muted-foreground text-xs">
                            {fillMessage(emptyCopy.more, { count: hidden })}
                        </li>
                    ) : null}
                </ul>
            ) : null}
            {syncAction ? <div>{syncAction}</div> : null}
        </Card>
    );
}
