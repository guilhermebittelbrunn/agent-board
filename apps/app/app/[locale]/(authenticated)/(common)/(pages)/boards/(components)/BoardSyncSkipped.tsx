import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import type { CardSyncSkipDTO, CardSyncSkipReason } from "@repo/sdk/src/types";
import { TriangleAlertIcon, XIcon } from "lucide-react";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type BoardSyncSkippedProps = {
    skipped: CardSyncSkipDTO[];
    boardsDictionary: BoardsDictionary;
    onDismiss: () => void;
};

const REASON_KEY: Record<
    CardSyncSkipReason,
    keyof BoardsDictionary["board"]["skipped"]["reasons"]
> = {
    not_found: "notFound",
    frontmatter_invalid: "frontmatterInvalid",
    slug_invalid: "slugInvalid",
    slug_duplicated: "slugDuplicated",
    limit: "limit",
};

export function BoardSyncSkipped({
    skipped,
    boardsDictionary,
    onDismiss,
}: BoardSyncSkippedProps) {
    const skippedCopy = boardsDictionary.board.skipped;

    return (
        <Alert>
            <TriangleAlertIcon aria-hidden />
            <AlertTitle className="flex items-start justify-between gap-2">
                {skippedCopy.title}
                <Button
                    aria-label={skippedCopy.dismiss}
                    className="-mt-1 size-7"
                    onClick={onDismiss}
                    size="icon"
                    type="button"
                    variant="ghost"
                >
                    <XIcon aria-hidden />
                </Button>
            </AlertTitle>
            <AlertDescription>
                <ul className="flex flex-col gap-1">
                    {skipped.map((skip) => (
                        <li key={`${skip.path}-${skip.reason}`}>
                            <span className="break-all font-mono">
                                {skip.path}
                            </span>
                            {" · "}
                            {skippedCopy.reasons[REASON_KEY[skip.reason]]}
                        </li>
                    ))}
                </ul>
            </AlertDescription>
        </Alert>
    );
}
