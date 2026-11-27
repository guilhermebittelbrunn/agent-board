"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HookFormRadioGroup } from "@repo/design-system/components/form/hookform";
import {
    Alert,
    AlertDescription,
} from "@repo/design-system/components/ui/alert";
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@repo/design-system/components/ui/form";
import type { RadioOption } from "@repo/design-system/components/ui/radio-group-input";
import { getDictionary } from "@repo/internationalization/client";
import { canTriggerStages } from "@repo/kanban-contract";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { Container } from "@/shared/components/ui/Container";
import { Footer } from "@/shared/components/ui/Footer";
import { FormContainer } from "@/shared/components/ui/FormContainer";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { COMMON_ROUTES } from "../../../../../../paths";
import {
    type BoardsDictionary,
    fillMessage,
} from "../../../../(components)/boardConfigIssueMessage";
import { CycleSpecPicker } from "../../../../(components)/CycleSpecPicker";
import { isCycleCandidate } from "../../../../(components)/cycleCandidates";
import { isCycleLive } from "../../../../(components)/cycleRefetch";
import { useBoardCycleCrud } from "../../../../(hooks)/useBoardCycleCrud";
import { useFindBoardById } from "../../../../(hooks)/useFindBoardById";
import { useListBoardCards } from "../../../../(hooks)/useListBoardCards";
import { useListBoardCycles } from "../../../../(hooks)/useListBoardCycles";
import { useListRunners } from "../../../../(hooks)/useListRunners";
import {
    buildNewCycleFormSchema,
    CYCLE_CONCURRENCY_VALUES,
    NEW_CYCLE_DEFAULTS,
    type NewCycleFormValues,
    toCreateCycleRequest,
} from "../../../../(validations)/newCycleSchema";

const RUNNERS_FOR_TWO = 2;

type NewCycleCopy = BoardsDictionary["cycles"]["new"];

function QueuedNotice({
    href,
    newCopy,
}: {
    href: string;
    newCopy: NewCycleCopy;
}) {
    return (
        <Alert>
            <AlertDescription className="flex flex-wrap items-center gap-2">
                {newCopy.queuedNotice}
                <Link className="font-medium underline" href={href}>
                    {newCopy.viewCurrent}
                </Link>
            </AlertDescription>
        </Alert>
    );
}

/** Two at once needs two of the person's runners online; the API refuses it otherwise. */
function ConcurrencyField({
    newCopy,
    selected,
    onlineRunners,
}: {
    newCopy: NewCycleCopy;
    selected: NewCycleFormValues["concurrency"];
    onlineRunners: number;
}) {
    return (
        <div className="flex flex-col gap-2">
            <HookFormRadioGroup
                label={newCopy.concurrency.label}
                name="concurrency"
                options={CYCLE_CONCURRENCY_VALUES.map((value) => ({
                    value,
                    label:
                        value === "2"
                            ? newCopy.concurrency.two
                            : newCopy.concurrency.one,
                }))}
            />
            {selected === "2" && onlineRunners < RUNNERS_FOR_TWO ? (
                <p className="text-muted-foreground text-sm">
                    {fillMessage(newCopy.concurrency.runnersWarning, {
                        count: onlineRunners,
                    })}
                </p>
            ) : null}
        </div>
    );
}

export function NewCycleClient() {
    const params = useParams<{ id: string }>();
    const id = typeof params.id === "string" ? params.id : "";
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const cyclesCopy = boardsDictionary.cycles;
    const newCopy = cyclesCopy.new;

    const {
        data: board,
        isLoading: isBoardLoading,
        error: boardError,
    } = useFindBoardById(id);
    const {
        data: cards,
        isLoading: areCardsLoading,
        error: cardsError,
    } = useListBoardCards(id);
    const { data: cycles } = useListBoardCycles(id);
    const { data: runners } = useListRunners({ poll: false });
    const { createCycleMutation } = useBoardCycleCrud(id);

    const schema = useMemo(
        () => buildNewCycleFormSchema(dictionary),
        [dictionary]
    );
    const form = useForm<NewCycleFormValues>({
        resolver: zodResolver(schema),
        defaultValues: NEW_CYCLE_DEFAULTS,
    });

    const candidates = useMemo(() => {
        const inActiveCycle = new Set(
            cycles
                .filter(isCycleLive)
                .flatMap((cycle) => cycle.items.map((item) => item.slug))
        );
        return cards
            .filter(
                (card) =>
                    isCycleCandidate(card) && !inActiveCycle.has(card.slug)
            )
            .sort((left, right) => left.order - right.order);
    }, [cards, cycles]);
    const runningCycle = cycles.find((cycle) => cycle.status === "running");
    const onlineRunners = runners.filter((runner) => runner.online).length;
    const slugs = form.watch("slugs");
    const concurrency = form.watch("concurrency");

    const optionsOf = <Key extends string>(
        values: readonly Key[],
        labels: Record<Key, string>
    ): RadioOption[] =>
        values.map((value) => ({ value, label: labels[value] }));

    const error = boardError ?? cardsError;
    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isLoading = isBoardLoading || areCardsLoading;
    const canTrigger = canTriggerStages(board?.access.effectiveRole ?? null);

    const onSubmit = (values: NewCycleFormValues) => {
        createCycleMutation.mutate(toCreateCycleRequest(values));
    };

    return (
        <>
            <Header
                breadcrumbs={[
                    {
                        label: routes.boards.list.label,
                        href: routes.boards.list.url,
                    },
                    {
                        label: board?.name ?? routes.boards.cycles(id).label,
                        href: routes.boards.cycles(id).url,
                    },
                ]}
                page={newCopy.title}
            />
            <Container
                header={
                    <PageHeader
                        description={newCopy.description}
                        title={newCopy.title}
                    />
                }
                loadError={
                    loadError ??
                    (board || isLoading ? null : cyclesCopy.loadError)
                }
                loading={isLoading}
            >
                {board && canTrigger ? (
                    <Form {...form}>
                        <form
                            className="flex w-full flex-1 flex-col gap-6"
                            onSubmit={form.handleSubmit(onSubmit)}
                        >
                            {runningCycle ? (
                                <QueuedNotice
                                    href={
                                        routes.boards.cycle(id, runningCycle.id)
                                            .url
                                    }
                                    newCopy={newCopy}
                                />
                            ) : null}
                            <FormField
                                control={form.control}
                                name="slugs"
                                render={({ field, fieldState }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {newCopy.specs.title}
                                        </FormLabel>
                                        <p
                                            className="text-muted-foreground text-sm"
                                            id="cycle-specs-hint"
                                        >
                                            {newCopy.specs.hint}
                                        </p>
                                        <CycleSpecPicker
                                            boardsDictionary={boardsDictionary}
                                            cards={candidates}
                                            describedBy="cycle-specs-hint"
                                            disabled={
                                                createCycleMutation.isPending
                                            }
                                            onChange={field.onChange}
                                            selected={field.value}
                                        />
                                        <FormMessage
                                            message={fieldState.error?.message}
                                        />
                                    </FormItem>
                                )}
                            />
                            <FormContainer>
                                <HookFormRadioGroup
                                    label={newCopy.until.label}
                                    name="until"
                                    options={optionsOf(
                                        ["pull_request", "testing"] as const,
                                        newCopy.until
                                    )}
                                />
                                <HookFormRadioGroup
                                    label={newCopy.onFailure.label}
                                    name="onFailure"
                                    options={optionsOf(
                                        ["skip", "stop"] as const,
                                        newCopy.onFailure
                                    )}
                                />
                                <ConcurrencyField
                                    newCopy={newCopy}
                                    onlineRunners={onlineRunners}
                                    selected={concurrency}
                                />
                            </FormContainer>
                            <p className="text-muted-foreground text-sm">
                                {newCopy.footer}
                            </p>
                            <Footer
                                backLabel={newCopy.cancel}
                                confirmLabel={
                                    slugs.length === 1
                                        ? newCopy.submitOne
                                        : fillMessage(newCopy.submit, {
                                              count: slugs.length,
                                          })
                                }
                                disabled={createCycleMutation.isPending}
                                isLoading={createCycleMutation.isPending}
                            />
                        </form>
                    </Form>
                ) : null}
            </Container>
        </>
    );
}
