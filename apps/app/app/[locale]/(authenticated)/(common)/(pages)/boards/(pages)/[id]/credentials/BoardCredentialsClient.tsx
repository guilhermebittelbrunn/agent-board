"use client";

import { getDictionary } from "@repo/internationalization/client";
import type { RunnerDTO, RunnerRegistrationDTO } from "@repo/sdk/src/types";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { env } from "@/env";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { COMMON_ROUTES } from "../../../../../paths";
import { BoardSectionNav } from "../../../(components)/BoardSectionNav";
import { RevokeRunnerDialog } from "../../../(components)/RevokeRunnerDialog";
import { RunnerList } from "../../../(components)/RunnerList";
import { RunnerRegistrationPanel } from "../../../(components)/RunnerRegistrationPanel";
import { ScheduledTaskSection } from "../../../(components)/ScheduledTaskSection";
import { useFindBoardById } from "../../../(hooks)/useFindBoardById";
import { useListRunners } from "../../../(hooks)/useListRunners";
import { useRunnerCrud } from "../../../(hooks)/useRunnerCrud";

const API_URL = env.NEXT_PUBLIC_API_URL ?? "";

const CLOCK_TICK_MS = 1000;

type OpenRegistration = RunnerRegistrationDTO & { knownIds: string[] };

function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) {
            return;
        }
        const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
        return () => clearInterval(timer);
    }, [active]);
    return now;
}

export function BoardCredentialsClient() {
    const params = useParams<{ id: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const [registration, setRegistration] = useState<OpenRegistration | null>(
        null
    );
    const [runnerToRevoke, setRunnerToRevoke] = useState<RunnerDTO | null>(
        null
    );
    const now = useNow(registration !== null);
    const expired =
        registration !== null && Date.parse(registration.expiresAt) <= now;

    const {
        data: board,
        isLoading: isBoardLoading,
        error: boardError,
    } = useFindBoardById(id);
    const [poll, setPoll] = useState(false);
    const {
        data: runners,
        isLoading: areRunnersLoading,
        error: runnersError,
    } = useListRunners({ poll });
    const { createRegistrationMutation, revokeMutation } = useRunnerCrud();

    const newRunner = registration
        ? (runners.find(
              (runner) => !registration.knownIds.includes(runner.id)
          ) ?? null)
        : null;
    const waiting = registration !== null && !expired && newRunner === null;
    const busy = runners.some((runner) => runner.currentRun !== null);
    useEffect(() => {
        setPoll(waiting || busy);
    }, [waiting, busy]);

    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const credentialsCopy = boardsDictionary.credentials;

    const error = boardError ?? runnersError;
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isLoading = isBoardLoading || areRunnersLoading;

    const generate = async () => {
        const created = await createRegistrationMutation.mutateAsync();
        setRegistration({
            ...created,
            knownIds: runners.map((runner) => runner.id),
        });
    };

    return (
        <>
            <Header
                breadcrumbs={[
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                ]}
                page={board?.name ?? credentialsCopy.title}
            />
            <Container
                header={
                    <div className="flex flex-col gap-4">
                        <BoardSectionNav
                            active="credentials"
                            boardsDictionary={boardsDictionary}
                            links={{
                                board: routes.boards.detail(id).url,
                                settings: routes.boards.settings(id).url,
                                members: routes.boards.members(id).url,
                                credentials: routes.boards.credentials(id).url,
                            }}
                        />
                        <PageHeader
                            description={credentialsCopy.description}
                            title={credentialsCopy.title}
                        />
                    </div>
                }
                loadError={
                    loadError ??
                    (board || isLoading ? null : credentialsCopy.loadError)
                }
                loading={isLoading}
            >
                {board ? (
                    <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                        <section
                            aria-labelledby="runners-title"
                            className="flex min-w-0 flex-col gap-4"
                        >
                            <div className="flex flex-col gap-1">
                                <h2
                                    className="font-semibold"
                                    id="runners-title"
                                >
                                    {credentialsCopy.runners.title}
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    {credentialsCopy.runners.description}
                                </p>
                            </div>
                            <RunnerList
                                board={board}
                                boardsDictionary={boardsDictionary}
                                canRevoke
                                onRevoke={setRunnerToRevoke}
                                runners={runners}
                            />
                            <RunnerRegistrationPanel
                                apiUrl={API_URL}
                                boardsDictionary={boardsDictionary}
                                canGenerate
                                expired={expired}
                                isGenerating={
                                    createRegistrationMutation.isPending
                                }
                                onGenerate={generate}
                                registeredName={newRunner?.name ?? null}
                                registration={registration}
                            />
                        </section>
                        <aside className="order-last flex flex-col gap-4 lg:order-none lg:row-span-2">
                            <div className="flex flex-col gap-2 rounded-md border p-4 text-sm">
                                <h2 className="font-semibold">
                                    {credentialsCopy.howItRuns.title}
                                </h2>
                                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                                    <li>{credentialsCopy.howItRuns.own}</li>
                                    <li>{credentialsCopy.howItRuns.refused}</li>
                                </ol>
                            </div>
                            <div className="flex flex-col gap-2 rounded-md border p-4 text-sm">
                                <h2 className="font-semibold">
                                    {credentialsCopy.secrets.title}
                                </h2>
                                <p className="text-muted-foreground">
                                    {credentialsCopy.secrets.body}
                                </p>
                            </div>
                        </aside>
                        <ScheduledTaskSection
                            board={board}
                            boardsDictionary={boardsDictionary}
                        />
                        <RevokeRunnerDialog
                            boardsDictionary={boardsDictionary}
                            isPending={revokeMutation.isPending}
                            onCancel={() => setRunnerToRevoke(null)}
                            onConfirm={(runner) =>
                                revokeMutation.mutate(runner, {
                                    onSettled: () => setRunnerToRevoke(null),
                                })
                            }
                            runner={runnerToRevoke}
                        />
                    </div>
                ) : null}
            </Container>
        </>
    );
}
