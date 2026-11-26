"use client";

import { cn } from "@repo/design-system/lib/utils";
import { getDictionary } from "@repo/internationalization/client";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { CheckIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/shared/components/ui/Container";
import { Footer } from "@/shared/components/ui/Footer";
import { Header } from "@/shared/components/ui/Header";
import { ImpersonationReadOnlyNotice } from "@/shared/components/ui/ImpersonationReadOnlyNotice";
import { LoadErrorState } from "@/shared/components/ui/LoadErrorState";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useAuthRequestPanel } from "@/shared/providers/AuthRequestPanelContext";
import { COMMON_ROUTES } from "../../../../paths";
import { BoardColumnsPreview } from "../../(components)/BoardColumnsPreview";
import { BoardConfigFileCard } from "../../(components)/BoardConfigFileCard";
import { BoardRulesSummary } from "../../(components)/BoardRulesSummary";
import {
    type BoardsDictionary,
    fillMessage,
} from "../../(components)/boardConfigIssueMessage";
import {
    blockedCreateHint,
    repositoryAccessLine,
} from "../../(components)/newBoardWizardCopy";
import { RepositoryPicker } from "../../(components)/RepositoryPicker";
import { RepositorySummary } from "../../(components)/RepositorySummary";
import { useBoardCrud } from "../../(hooks)/useBoardCrud";
import { useListImportableRepositories } from "../../(hooks)/useListImportableRepositories";
import { usePreviewBoardImport } from "../../(hooks)/usePreviewBoardImport";

const TOTAL_STEPS = 2;

type WizardStepsProps = {
    current: 1 | 2;
    boardsDictionary: BoardsDictionary;
};

function WizardSteps({ current, boardsDictionary }: WizardStepsProps) {
    const stepsCopy = boardsDictionary.wizard.steps;
    const steps = [stepsCopy.repository, stepsCopy.readConfig];

    return (
        <nav aria-label={stepsCopy.label} className="flex flex-col gap-4">
            <p className="font-medium text-muted-foreground text-sm lg:hidden">
                {fillMessage(stepsCopy.progress, {
                    current,
                    total: TOTAL_STEPS,
                })}
            </p>
            <ol className="hidden flex-col gap-1 lg:flex">
                {steps.map((label, index) => {
                    const step = index + 1;
                    const done = step < current;
                    const active = step === current;
                    return (
                        <li
                            aria-current={active ? "step" : undefined}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                                active && "border bg-card font-semibold"
                            )}
                            key={label}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "flex size-6 items-center justify-center rounded-full border text-xs",
                                    (done || active) &&
                                        "border-primary bg-primary text-primary-foreground"
                                )}
                            >
                                {done ? <CheckIcon className="size-3" /> : step}
                            </span>
                            {label}
                        </li>
                    );
                })}
            </ol>
            <p className="hidden text-muted-foreground text-sm lg:block">
                {boardsDictionary.wizard.kitHint}
            </p>
        </nav>
    );
}

export function NewBoardClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedRepository = searchParams.get("repository");
    const { isImpersonating } = useAuthRequestPanel();
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const wizardCopy = boardsDictionary.wizard;

    const formatError = (error: unknown) =>
        error ? handleClientError(new FormattedError(error, locale)) : null;

    const repositories = useListImportableRepositories(!selectedRepository);
    const preview = usePreviewBoardImport(selectedRepository);
    const { createBoardMutation } = useBoardCrud({
        onCreated: (board) => router.push(routes.boards.detail(board.id).url),
    });

    const chooseRepository = (fullName: string | null) =>
        router.push(
            fullName
                ? routes.boards.createFor(fullName).url
                : routes.boards.create.url
        );

    const previewData = preview.data;
    const existingBoard =
        previewData && previewData.board !== null ? previewData.board : null;
    const canCreate =
        previewData?.status === "valid" &&
        existingBoard === null &&
        !isImpersonating;
    const currentStep = selectedRepository ? 2 : 1;
    const stepCopy = selectedRepository
        ? wizardCopy.readConfig
        : wizardCopy.repository;

    const readConfigBody = () => {
        if (preview.isLoading) {
            return null;
        }
        const previewError = formatError(preview.error);
        if (previewError || !previewData) {
            return (
                <LoadErrorState
                    message={previewError ?? wizardCopy.readConfig.loadError}
                />
            );
        }
        const createHint = blockedCreateHint(previewData, wizardCopy.footer);
        return (
            <>
                {existingBoard ? (
                    <LoadErrorState
                        message={wizardCopy.readConfig.alreadyHasBoard}
                    />
                ) : null}
                <BoardConfigFileCard
                    boardsDictionary={boardsDictionary}
                    isFetching={preview.isFetching}
                    onReadAgain={() => preview.refetch()}
                    preview={previewData}
                />
                {previewData.status === "missing" ? null : (
                    <BoardColumnsPreview
                        boardsDictionary={boardsDictionary}
                        config={previewData.config}
                        issues={previewData.issues}
                        rawStages={previewData.rawStages}
                    />
                )}
                {previewData.config ? (
                    <BoardRulesSummary
                        boardsDictionary={boardsDictionary}
                        config={previewData.config}
                    />
                ) : null}
                <div className="flex flex-col gap-1">
                    {createHint ? (
                        <p className="text-right text-muted-foreground text-sm">
                            {createHint}
                        </p>
                    ) : null}
                    <Footer
                        backLabel={wizardCopy.footer.cancel}
                        confirmLabel={wizardCopy.footer.create}
                        disabled={!canCreate || createBoardMutation.isPending}
                        isLoading={createBoardMutation.isPending}
                        onBack={() => router.push(routes.boards.list.url)}
                        onConfirm={() =>
                            createBoardMutation.mutate(selectedRepository ?? "")
                        }
                    />
                </div>
            </>
        );
    };

    return (
        <>
            <Header
                breadcrumbs={[
                    { label: routes.root.label, href: routes.root.url },
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                ]}
                page={routes.boards.create.label}
            />
            <Container
                header={
                    <PageHeader
                        description={stepCopy.subtitle}
                        title={stepCopy.title}
                    />
                }
                loading={Boolean(selectedRepository) && preview.isLoading}
            >
                <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
                    <WizardSteps
                        boardsDictionary={boardsDictionary}
                        current={currentStep}
                    />
                    <div className="flex min-w-0 flex-col gap-6">
                        <ImpersonationReadOnlyNotice />
                        {selectedRepository ? (
                            <>
                                <RepositorySummary
                                    accessLine={repositoryAccessLine(
                                        previewData,
                                        wizardCopy.readConfig
                                    )}
                                    boardsDictionary={boardsDictionary}
                                    fullName={
                                        previewData?.repository.fullName ??
                                        selectedRepository
                                    }
                                    onChange={() => chooseRepository(null)}
                                />
                                {readConfigBody()}
                            </>
                        ) : (
                            <RepositoryPicker
                                boardsDictionary={boardsDictionary}
                                boardUrl={(boardId) =>
                                    routes.boards.detail(boardId).url
                                }
                                isLoading={repositories.isLoading}
                                loadError={formatError(repositories.error)}
                                onChoose={chooseRepository}
                                repositories={repositories.data}
                            />
                        )}
                    </div>
                </div>
            </Container>
        </>
    );
}
