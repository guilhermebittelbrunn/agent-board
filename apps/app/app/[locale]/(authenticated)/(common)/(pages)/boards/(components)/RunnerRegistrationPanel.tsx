"use client";

import {
    Button,
    buttonVariants,
} from "@repo/design-system/components/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@repo/design-system/components/ui/collapsible";
import type { RunnerRegistrationDTO } from "@repo/sdk/src/types";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { RunnerCommandLine } from "./RunnerCommandLine";
import { RUNNER_SETUP_COMMANDS, runnerRegisterCommand } from "./runnerCommands";

const FIRST_STEPS_COUNT = 2;

function SetupStep({
    title,
    why,
    children,
}: {
    title: string;
    why: string;
    children?: ReactNode;
}) {
    return (
        <li className="flex flex-col gap-2 pl-1 marker:font-semibold marker:text-muted-foreground">
            <p className="font-medium">{title}</p>
            <p className="text-muted-foreground">{why}</p>
            {children}
        </li>
    );
}

type RunnerRegistrationPanelProps = {
    registration: RunnerRegistrationDTO | null;
    expired: boolean;
    registeredName: string | null;
    apiUrl: string;
    hasRunners: boolean;
    canGenerate: boolean;
    isGenerating: boolean;
    boardsDictionary: BoardsDictionary;
    onGenerate: () => void;
};

/**
 * The whole setup of a local runner, with why each step exists. Someone who already has a
 * runner sees the first-time steps folded, since they only repeat on a new machine.
 */
export function RunnerRegistrationPanel({
    registration,
    expired,
    registeredName,
    apiUrl,
    hasRunners,
    canGenerate,
    isGenerating,
    boardsDictionary,
    onGenerate,
}: RunnerRegistrationPanelProps) {
    const registerCopy = boardsDictionary.credentials.register;
    const formatDateTime = useFormatDisplayDateTime();
    let statusLine = registerCopy.waiting;
    if (registeredName) {
        statusLine = fillMessage(registerCopy.registered, {
            name: registeredName,
        });
    } else if (expired) {
        statusLine = "";
    }

    const firstSteps = (
        <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm">
            <SetupStep
                title={registerCopy.prerequisites.title}
                why={registerCopy.prerequisites.why}
            >
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>{registerCopy.prerequisites.node}</li>
                    <li>{registerCopy.prerequisites.claude}</li>
                    <li>{registerCopy.prerequisites.git}</li>
                </ul>
            </SetupStep>
            <SetupStep
                title={registerCopy.install.title}
                why={registerCopy.install.why}
            >
                <RunnerCommandLine
                    boardsDictionary={boardsDictionary}
                    command={RUNNER_SETUP_COMMANDS.install}
                />
            </SetupStep>
        </ol>
    );

    return (
        <section
            aria-labelledby="runner-register-title"
            className="flex flex-col gap-4 rounded-md border p-4"
        >
            <div className="flex flex-col gap-1">
                <h3
                    className="font-semibold text-sm"
                    id="runner-register-title"
                >
                    {hasRunners
                        ? registerCopy.titleAnother
                        : registerCopy.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                    {registerCopy.intro}
                </p>
            </div>
            {hasRunners ? (
                <Collapsible className="flex flex-col gap-3">
                    <CollapsibleTrigger
                        className={buttonVariants({
                            variant: "ghost",
                            className:
                                "group h-auto w-fit gap-2 whitespace-normal px-2 py-1 text-left font-medium text-sm [&[data-state=open]>svg]:rotate-180",
                        })}
                    >
                        {registerCopy.firstTime}
                        <ChevronDownIcon
                            aria-hidden
                            className="size-4 shrink-0 transition-transform"
                        />
                    </CollapsibleTrigger>
                    <CollapsibleContent>{firstSteps}</CollapsibleContent>
                </Collapsible>
            ) : (
                firstSteps
            )}
            <ol
                className="flex list-decimal flex-col gap-4 pl-5 text-sm"
                start={FIRST_STEPS_COUNT + 1}
            >
                <SetupStep
                    title={registerCopy.registerStep.title}
                    why={registerCopy.registerStep.why}
                >
                    {registration ? (
                        <>
                            <RunnerCommandLine
                                boardsDictionary={boardsDictionary}
                                command={runnerRegisterCommand(
                                    registration.code,
                                    apiUrl
                                )}
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
                        </>
                    ) : (
                        <p className="text-muted-foreground text-xs">
                            {registerCopy.registerStep.hint}
                        </p>
                    )}
                    <Button
                        className="self-start"
                        disabled={!canGenerate}
                        loading={isGenerating}
                        onClick={onGenerate}
                        size="sm"
                        type="button"
                        variant={registration ? "outline" : "default"}
                    >
                        {isGenerating
                            ? registerCopy.generating
                            : registerCopy.generate}
                    </Button>
                    {registration ? (
                        <output
                            aria-live="polite"
                            className="text-muted-foreground text-sm"
                        >
                            {statusLine}
                        </output>
                    ) : null}
                </SetupStep>
                <SetupStep
                    title={registerCopy.startStep.title}
                    why={registerCopy.startStep.why}
                >
                    <RunnerCommandLine
                        boardsDictionary={boardsDictionary}
                        command={RUNNER_SETUP_COMMANDS.start}
                    />
                </SetupStep>
                <SetupStep
                    title={registerCopy.parallel.title}
                    why={registerCopy.parallel.why}
                >
                    <RunnerCommandLine
                        boardsDictionary={boardsDictionary}
                        command={RUNNER_SETUP_COMMANDS.list}
                    />
                </SetupStep>
            </ol>
            <div className="flex flex-col gap-2 border-t pt-4 text-sm">
                <p className="font-medium">{registerCopy.update.title}</p>
                <p className="text-muted-foreground">
                    {registerCopy.update.why}
                </p>
                <RunnerCommandLine
                    boardsDictionary={boardsDictionary}
                    command={RUNNER_SETUP_COMMANDS.update}
                />
            </div>
        </section>
    );
}
