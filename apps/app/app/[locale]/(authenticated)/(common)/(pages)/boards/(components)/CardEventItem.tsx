"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HookFormTextarea } from "@repo/design-system/components/form/hookform";
import { ActionsMenu } from "@repo/design-system/components/ui/action-menu";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Form } from "@repo/design-system/components/ui/form";
import { getDictionary } from "@repo/internationalization/client";
import type { StageOutcome } from "@repo/kanban-contract";
import type { CardEventViewDTO } from "@repo/sdk/src/types";
import {
    Bot,
    CircleHelp,
    ClipboardCheck,
    FileText,
    MessageSquare,
    Reply,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useFormatDisplayDateTime } from "@/shared/lib/formatDisplayDateTime";
import {
    buildCardCommentSchema,
    type CardCommentFormValues,
} from "../(validations)/cardEventSchemas";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { ReadOnlyQuestion } from "./CardQuestions";
import { githubFileUrl } from "./githubFileUrl";
import { type SpecLinkBase, SpecMarkdown } from "./SpecMarkdown";
import { shortSha } from "./shortSha";

export type CardEventActions = {
    onEditComment: (eventId: string, markdown: string) => Promise<unknown>;
    onDeleteComment: (eventId: string) => void;
    canEditComments: boolean;
};

type CardEventItemProps = {
    event: CardEventViewDTO;
    links: SpecLinkBase;
    pendingEventId: string | null;
    actions: CardEventActions;
    boardsDictionary: BoardsDictionary;
};

type TimelineCopy = BoardsDictionary["cardDetail"]["timeline"];

const ICONS: Record<CardEventViewDTO["type"], typeof Bot> = {
    update: Bot,
    question: CircleHelp,
    answer: Reply,
    artifact: FileText,
    report: ClipboardCheck,
    comment: MessageSquare,
};

const OUTCOME_VARIANT: Record<
    StageOutcome,
    "secondary" | "outline" | "destructive"
> = {
    success: "secondary",
    needs_input: "outline",
    needs_rework: "outline",
    failed: "destructive",
};

export const eventAnchorId = (eventId: string) => `card-event-${eventId}`;

function authorName(event: CardEventViewDTO): string {
    return event.author.kind === "agent"
        ? event.author.name
        : event.author.login;
}

function headline(event: CardEventViewDTO, timelineCopy: TimelineCopy): string {
    const login = authorName(event);
    if (event.type === "comment") {
        return fillMessage(timelineCopy.commented, { login });
    }
    if (event.type === "answer") {
        return fillMessage(timelineCopy.answered, { login });
    }
    return login;
}

function QuestionStatus({
    event,
    pendingEventId,
    timelineCopy,
}: {
    event: Extract<CardEventViewDTO, { type: "question" }>;
    pendingEventId: string | null;
    timelineCopy: TimelineCopy;
}) {
    if (event.answeredByEventId) {
        return (
            <a
                className="text-primary text-sm underline-offset-4 hover:underline"
                href={`#${eventAnchorId(event.answeredByEventId)}`}
            >
                {timelineCopy.questionAnswered}
            </a>
        );
    }
    return (
        <span className="text-muted-foreground text-sm">
            {pendingEventId === event.id
                ? timelineCopy.questionPending
                : timelineCopy.questionUnanswered}
        </span>
    );
}

function CommentEditor({
    event,
    onSave,
    onCancel,
    timelineCopy,
}: {
    event: Extract<CardEventViewDTO, { type: "comment" }>;
    onSave: (markdown: string) => Promise<unknown>;
    onCancel: () => void;
    timelineCopy: TimelineCopy;
}) {
    const { dictionary } = getDictionary();
    const schema = useMemo(
        () => buildCardCommentSchema(dictionary),
        [dictionary]
    );
    const form = useForm<CardCommentFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { markdown: event.markdown },
    });

    const onSubmit = async (values: CardCommentFormValues) => {
        try {
            await onSave(values.markdown);
            onCancel();
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
                    id={`card-comment-edit-${event.id}`}
                    label={timelineCopy.editLabel}
                    name="markdown"
                    required
                />
                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel} type="button" variant="outline">
                        {timelineCopy.cancel}
                    </Button>
                    <Button loading={form.formState.isSubmitting} type="submit">
                        {timelineCopy.save}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

function EventBody({
    event,
    links,
    pendingEventId,
    boardsDictionary,
}: Omit<CardEventItemProps, "actions">): ReactNode {
    const detailCopy = boardsDictionary.cardDetail;
    const timelineCopy = detailCopy.timeline;

    switch (event.type) {
        case "update":
            return <SpecMarkdown content={event.markdown} links={links} />;
        case "comment":
            return (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                    <SpecMarkdown content={event.markdown} links={links} />
                </div>
            );
        case "report":
            return (
                <Card className="gap-3 p-4">
                    <Badge
                        className="w-fit"
                        variant={OUTCOME_VARIANT[event.outcome]}
                    >
                        {timelineCopy.outcomes[event.outcome]}
                    </Badge>
                    <SpecMarkdown content={event.markdown} links={links} />
                </Card>
            );
        case "question":
            return (
                <div className="flex flex-col gap-4">
                    {event.questions.map((question, index) => (
                        <ReadOnlyQuestion
                            index={index}
                            key={`${index}-${question.header}`}
                            question={question}
                            questionsCopy={detailCopy.questions}
                        />
                    ))}
                    <QuestionStatus
                        event={event}
                        pendingEventId={pendingEventId}
                        timelineCopy={timelineCopy}
                    />
                </div>
            );
        case "answer":
            return (
                <dl className="flex flex-col gap-2 text-sm">
                    {event.answers.map((answer, index) => (
                        <div
                            className="flex flex-col gap-0.5"
                            key={`${index}-${answer.header}`}
                        >
                            <dt className="text-muted-foreground">
                                {index + 1}. {answer.question}
                            </dt>
                            <dd className="whitespace-pre-wrap break-words">
                                {answer.choice.kind === "option"
                                    ? answer.choice.label
                                    : `${timelineCopy.answerText}: ${answer.choice.text}`}
                            </dd>
                        </div>
                    ))}
                </dl>
            );
        default: {
            const { path, commitSha } = event.artifact;
            return (
                <a
                    aria-label={fillMessage(detailCopy.artifacts.openOnGithub, {
                        path,
                    })}
                    className="flex w-fit max-w-full items-center gap-2 rounded-md border border-border px-2 py-1 text-sm hover:bg-accent"
                    href={githubFileUrl(
                        links.owner,
                        links.name,
                        commitSha,
                        path
                    )}
                    rel="noreferrer noopener"
                    target="_blank"
                >
                    <span className="break-all font-mono">{path}</span>
                    <span className="font-mono text-muted-foreground text-xs">
                        {shortSha(commitSha)}
                    </span>
                </a>
            );
        }
    }
}

export function CardEventItem({
    event,
    links,
    pendingEventId,
    actions,
    boardsDictionary,
}: CardEventItemProps) {
    const formatDateTime = useFormatDisplayDateTime();
    const [isEditing, setIsEditing] = useState(false);
    const timelineCopy = boardsDictionary.cardDetail.timeline;
    const Icon = ICONS[event.type];
    const canEdit =
        event.type === "comment" && event.isOwn && actions.canEditComments;

    return (
        <li
            className="flex min-w-0 scroll-mt-24 gap-3"
            id={eventAnchorId(event.id)}
        >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                <Icon aria-hidden className="size-4" />
                <span className="sr-only">
                    {timelineCopy.types[event.type]}
                </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 items-start gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm">
                        <span className="font-medium">
                            {headline(event, timelineCopy)}
                        </span>
                        <span className="text-muted-foreground">
                            {" · "}
                            <time dateTime={event.createdAt}>
                                {formatDateTime(event.createdAt)}
                            </time>
                            {event.type === "comment" && event.editedAt
                                ? ` ${timelineCopy.edited}`
                                : null}
                        </span>
                    </p>
                    {canEdit && !isEditing ? (
                        <ActionsMenu
                            deleteLabels={{
                                action: timelineCopy.delete,
                                confirmTitle: timelineCopy.deleteTitle,
                                confirmDescription: timelineCopy.deleteBody,
                            }}
                            onDelete={() => actions.onDeleteComment(event.id)}
                            onEdit={() => setIsEditing(true)}
                            triggerLabel={timelineCopy.commentActions}
                        />
                    ) : null}
                </div>
                {isEditing && event.type === "comment" ? (
                    <CommentEditor
                        event={event}
                        onCancel={() => setIsEditing(false)}
                        onSave={(markdown) =>
                            actions.onEditComment(event.id, markdown)
                        }
                        timelineCopy={timelineCopy}
                    />
                ) : (
                    <EventBody
                        boardsDictionary={boardsDictionary}
                        event={event}
                        links={links}
                        pendingEventId={pendingEventId}
                    />
                )}
            </div>
        </li>
    );
}
