"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HookFormTextarea } from "@repo/design-system/components/form/hookform";
import { Button } from "@repo/design-system/components/ui/button";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Form } from "@repo/design-system/components/ui/form";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { getDictionary } from "@repo/internationalization/client";
import type { BoardConfig } from "@repo/kanban-contract";
import type { CardEventViewDTO } from "@repo/sdk/src/types";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { LoadErrorState } from "@/shared/components/ui/LoadErrorState";
import {
    buildCardCommentSchema,
    type CardCommentFormValues,
} from "../(validations)/cardEventSchemas";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { type CardEventActions, CardEventItem } from "./CardEventItem";
import { type CardEventGroupLabel, groupCardEvents } from "./groupCardEvents";
import type { SpecLinkBase } from "./SpecMarkdown";

type CardTimelineProps = {
    events: CardEventViewDTO[];
    isLoading: boolean;
    loadError: string | null;
    config: BoardConfig;
    links: SpecLinkBase;
    pendingEventId: string | null;
    canComment: boolean;
    onComment: (markdown: string) => Promise<unknown>;
    actions: CardEventActions;
    boardsDictionary: BoardsDictionary;
};

type TimelineCopy = BoardsDictionary["cardDetail"]["timeline"];

function groupTitle(
    label: CardEventGroupLabel,
    timelineCopy: TimelineCopy
): string {
    switch (label.kind) {
        case "tasks":
            return timelineCopy.groups.tasks;
        case "done":
            return timelineCopy.groups.done;
        case "removed": {
            const removed = fillMessage(timelineCopy.groups.removedStage, {
                key: label.stageKey,
            });
            return label.loop === 0
                ? removed
                : fillMessage(timelineCopy.groups.rework, {
                      column: removed,
                      count: label.loop,
                  });
        }
        default:
            return label.loop === 0
                ? label.column
                : fillMessage(timelineCopy.groups.rework, {
                      column: label.column,
                      count: label.loop,
                  });
    }
}

function CommentForm({
    onComment,
    timelineCopy,
}: {
    onComment: (markdown: string) => Promise<unknown>;
    timelineCopy: TimelineCopy;
}) {
    const { dictionary } = getDictionary();
    const schema = useMemo(
        () => buildCardCommentSchema(dictionary),
        [dictionary]
    );
    const form = useForm<CardCommentFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { markdown: "" },
    });

    const onSubmit = async (values: CardCommentFormValues) => {
        try {
            await onComment(values.markdown);
            form.reset({ markdown: "" });
        } catch {
            // The mutation already showed the error; the text stays for a retry.
        }
    };

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-2"
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
            >
                <HookFormTextarea<CardCommentFormValues>
                    label={timelineCopy.commentLabel}
                    name="markdown"
                    placeholder={timelineCopy.commentPlaceholder}
                />
                <Button
                    className="w-fit self-end"
                    loading={form.formState.isSubmitting}
                    type="submit"
                >
                    {timelineCopy.commentSubmit}
                </Button>
            </form>
        </Form>
    );
}

function TimelineSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            {["first", "second", "third"].map((key) => (
                <div className="flex gap-3" key={key}>
                    <Skeleton className="size-7 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-5/6" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function CardTimeline({
    events,
    isLoading,
    loadError,
    config,
    links,
    pendingEventId,
    canComment,
    onComment,
    actions,
    boardsDictionary,
}: CardTimelineProps) {
    const timelineCopy = boardsDictionary.cardDetail.timeline;
    const groups = useMemo(
        () => groupCardEvents(events, config),
        [events, config]
    );

    const content = (() => {
        if (isLoading) {
            return <TimelineSkeleton />;
        }
        if (loadError) {
            return <LoadErrorState message={loadError} />;
        }
        if (groups.length === 0) {
            return (
                <Empty className="border border-border border-dashed">
                    <EmptyHeader>
                        <EmptyTitle>{timelineCopy.empty.title}</EmptyTitle>
                        <EmptyDescription>
                            {timelineCopy.empty.body}
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            );
        }
        return groups.map((group) => {
            const headingId = `card-events-${group.id.replace(/\W/g, "-")}`;
            return (
                <section
                    aria-labelledby={headingId}
                    className="flex flex-col gap-3"
                    key={group.id}
                >
                    <h3
                        className="font-semibold text-muted-foreground text-sm"
                        id={headingId}
                    >
                        {groupTitle(group.label, timelineCopy)}
                    </h3>
                    <ol className="flex flex-col gap-5">
                        {group.events.map((event) => (
                            <CardEventItem
                                actions={actions}
                                boardsDictionary={boardsDictionary}
                                event={event}
                                key={event.id}
                                links={links}
                                pendingEventId={pendingEventId}
                            />
                        ))}
                    </ol>
                </section>
            );
        });
    })();

    return (
        <div className="flex min-w-0 flex-col gap-6">
            {canComment ? (
                <CommentForm
                    onComment={onComment}
                    timelineCopy={timelineCopy}
                />
            ) : null}
            {content}
        </div>
    );
}
