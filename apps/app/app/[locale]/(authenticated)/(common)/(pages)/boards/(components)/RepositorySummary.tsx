import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { GithubIcon } from "lucide-react";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type RepositorySummaryProps = {
    fullName: string;
    accessLine: string | null;
    onChange: () => void;
    boardsDictionary: BoardsDictionary;
};

export function RepositorySummary({
    fullName,
    accessLine,
    onChange,
    boardsDictionary,
}: RepositorySummaryProps) {
    const readConfigCopy = boardsDictionary.wizard.readConfig;

    return (
        <Card className="flex-row flex-wrap items-center gap-3 p-4">
            <GithubIcon aria-hidden className="size-5 shrink-0" />
            <div className="flex min-w-40 flex-1 flex-col">
                <span className="break-words font-semibold text-sm">
                    {fullName}
                </span>
                {accessLine ? (
                    <span className="text-muted-foreground text-xs">
                        {accessLine}
                    </span>
                ) : null}
            </div>
            <Button onClick={onChange} type="button" variant="ghost">
                {readConfigCopy.changeRepository}
            </Button>
        </Card>
    );
}
