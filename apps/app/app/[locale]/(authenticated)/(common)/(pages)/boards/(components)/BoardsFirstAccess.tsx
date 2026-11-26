"use client";

import {
    Button,
    buttonVariants,
} from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { CheckIcon, CopyIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

const COPY_FEEDBACK_MS = 2000;

type BoardsFirstAccessProps = {
    newBoardUrl: string;
    boardsDictionary: BoardsDictionary;
};

function StepNumber({ value }: { value: number }) {
    return (
        <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full border font-semibold text-sm"
        >
            {value}
        </span>
    );
}

export function BoardsFirstAccess({
    newBoardUrl,
    boardsDictionary,
}: BoardsFirstAccessProps) {
    const firstAccessCopy = boardsDictionary.firstAccess;
    const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
        "idle"
    );

    const copyCommand = async () => {
        try {
            await navigator.clipboard.writeText(
                firstAccessCopy.applyKit.command
            );
            setCopyState("copied");
        } catch {
            setCopyState("failed");
        }
        setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
    };

    const copyLabel = {
        idle: firstAccessCopy.applyKit.copy,
        copied: firstAccessCopy.applyKit.copied,
        failed: firstAccessCopy.applyKit.copyFailed,
    }[copyState];

    return (
        <ol className="flex flex-col gap-4">
            <li>
                <Card className="flex-row gap-4 p-5">
                    <StepNumber value={1} />
                    <div className="flex flex-col gap-1">
                        <h2 className="font-semibold">
                            {firstAccessCopy.installApp.title}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {firstAccessCopy.installApp.body}
                        </p>
                    </div>
                </Card>
            </li>
            <li>
                <Card className="flex-row gap-4 p-5">
                    <StepNumber value={2} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <h2 className="font-semibold">
                            {firstAccessCopy.applyKit.title}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {firstAccessCopy.applyKit.body}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">
                                {firstAccessCopy.applyKit.command}
                            </code>
                            <Button
                                aria-label={firstAccessCopy.applyKit.copyAria}
                                onClick={copyCommand}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                {copyState === "copied" ? (
                                    <CheckIcon />
                                ) : (
                                    <CopyIcon />
                                )}
                                {copyLabel}
                            </Button>
                            <output aria-live="polite" className="sr-only">
                                {copyState === "idle" ? "" : copyLabel}
                            </output>
                        </div>
                    </div>
                </Card>
            </li>
            <li>
                <Card className="flex-row flex-wrap gap-4 p-5">
                    <StepNumber value={3} />
                    <div className="flex min-w-48 flex-1 flex-col gap-1">
                        <h2 className="font-semibold">
                            {firstAccessCopy.createBoard.title}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {firstAccessCopy.createBoard.body}
                        </p>
                    </div>
                    <Link className={buttonVariants()} href={newBoardUrl}>
                        {firstAccessCopy.createBoard.action}
                    </Link>
                </Card>
            </li>
        </ol>
    );
}
