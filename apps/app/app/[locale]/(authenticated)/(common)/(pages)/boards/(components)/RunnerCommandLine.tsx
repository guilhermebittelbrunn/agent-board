"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

const COPY_FEEDBACK_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

export function RunnerCommandLine({
    command,
    boardsDictionary,
}: {
    command: string;
    boardsDictionary: BoardsDictionary;
}) {
    const registerCopy = boardsDictionary.credentials.register;
    const [copyState, setCopyState] = useState<CopyState>("idle");

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(command);
            setCopyState("copied");
        } catch {
            setCopyState("failed");
        }
        setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
    };

    const label = {
        idle: registerCopy.copy,
        copied: registerCopy.copied,
        failed: registerCopy.copyFailed,
    }[copyState];

    return (
        <div className="flex flex-wrap items-center gap-2">
            <code
                className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-muted px-3 py-2 font-mono text-sm"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: on a narrow screen the command scrolls sideways, and only a focusable box can be scrolled from the keyboard.
                tabIndex={0}
            >
                {command}
            </code>
            <Button
                aria-label={fillMessage(registerCopy.copyAria, { command })}
                onClick={copy}
                size="sm"
                type="button"
                variant="outline"
            >
                {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
                {label}
            </Button>
            <output aria-live="polite" className="sr-only">
                {copyState === "idle" ? "" : label}
            </output>
        </div>
    );
}
