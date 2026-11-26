"use client";

import { Button } from "@repo/design-system/components/ui/button";
import type { RunnerRegistrationDTO } from "@repo/sdk/src/types";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { runnerCommands } from "./runnerCommands";

const COPY_FEEDBACK_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

function CommandLine({
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

type RunnerRegistrationPanelProps = {
    registration: RunnerRegistrationDTO | null;
    expired: boolean;
    registeredName: string | null;
    apiUrl: string;
    canGenerate: boolean;
    isGenerating: boolean;
    boardsDictionary: BoardsDictionary;
    onGenerate: () => void;
};

export function RunnerRegistrationPanel({
    registration,
    expired,
    registeredName,
    apiUrl,
    canGenerate,
    isGenerating,
    boardsDictionary,
    onGenerate,
}: RunnerRegistrationPanelProps) {
    const registerCopy = boardsDictionary.credentials.register;
    const formatDateTime = useFormatDisplayDateTime();
    const commands = registration
        ? runnerCommands(registration.code, apiUrl)
        : null;
    let statusLine = registerCopy.waiting;
    if (registeredName) {
        statusLine = fillMessage(registerCopy.registered, {
            name: registeredName,
        });
    } else if (expired) {
        statusLine = "";
    }

    return (
        <section
            aria-labelledby="runner-register-title"
            className="flex flex-col gap-3 rounded-md border p-4"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3
                    className="font-semibold text-sm"
                    id="runner-register-title"
                >
                    {registerCopy.title}
                </h3>
                <Button
                    disabled={!canGenerate}
                    loading={isGenerating}
                    onClick={onGenerate}
                    size="sm"
                    type="button"
                >
                    {isGenerating
                        ? registerCopy.generating
                        : registerCopy.generate}
                </Button>
            </div>
            {registration && commands ? (
                <ol className="flex flex-col gap-3 text-sm">
                    <li className="flex flex-col gap-2">
                        <p>{registerCopy.step1}</p>
                        <CommandLine
                            boardsDictionary={boardsDictionary}
                            command={commands.register}
                        />
                        <p className="text-muted-foreground text-xs">
                            {expired
                                ? registerCopy.expired
                                : fillMessage(registerCopy.expiresAt, {
                                      time: formatDateTime(
                                          registration.expiresAt
                                      ),
                                  })}
                        </p>
                    </li>
                    <li className="flex flex-col gap-2">
                        <p>{registerCopy.step2}</p>
                        <CommandLine
                            boardsDictionary={boardsDictionary}
                            command={commands.start}
                        />
                    </li>
                </ol>
            ) : null}
            {registration ? (
                <output
                    aria-live="polite"
                    className="text-muted-foreground text-sm"
                >
                    {statusLine}
                </output>
            ) : null}
        </section>
    );
}
