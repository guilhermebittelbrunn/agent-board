"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    HookFormRadioGroup,
    HookFormTextarea,
} from "@repo/design-system/components/form/hookform";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Form } from "@repo/design-system/components/ui/form";
import { getDictionary } from "@repo/internationalization/client";
import type { Answer, BoardConfig, Question } from "@repo/kanban-contract";
import { useId, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
    buildCardQuestionsSchema,
    type CardQuestionsFormValues,
    initialQuestionAnswers,
    OTHER_ANSWER,
    toAnswers,
} from "../(validations)/cardEventSchemas";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

type CardQuestionsProps = {
    questions: Question[];
    stageKey: string;
    config: BoardConfig;
    canAnswer: boolean;
    isSubmitting: boolean;
    onAnswer: (answers: Answer[]) => Promise<unknown>;
    /** Answering runs the stage again, so the button says so. */
    resumes: boolean;
    boardsDictionary: BoardsDictionary;
};

type QuestionsCopy = BoardsDictionary["cardDetail"]["questions"];

function QuestionHeading({
    index,
    question,
}: {
    index: number;
    question: Question;
}) {
    return (
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {index + 1}. {question.header}
        </span>
    );
}

export function ReadOnlyQuestion({
    index,
    question,
    questionsCopy,
}: {
    index: number;
    question: Question;
    questionsCopy: QuestionsCopy;
}) {
    return (
        <div className="flex flex-col gap-2">
            <QuestionHeading index={index} question={question} />
            <p className="font-medium text-sm">{question.question}</p>
            <ul className="flex flex-col gap-2 pl-1">
                {question.options.map((option, optionIndex) => (
                    <li
                        className="flex flex-col gap-0.5"
                        key={`${optionIndex}-${option.label}`}
                    >
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                            {option.label}
                            {question.recommended === optionIndex ? (
                                <Badge variant="secondary">
                                    {questionsCopy.recommended}
                                </Badge>
                            ) : null}
                        </span>
                        {option.description ? (
                            <span className="text-muted-foreground text-sm">
                                {option.description}
                            </span>
                        ) : null}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function AnswerQuestionField({
    index,
    question,
    questionsCopy,
}: {
    index: number;
    question: Question;
    questionsCopy: QuestionsCopy;
}) {
    const choice = useWatch<CardQuestionsFormValues>({
        name: `answers.${index}.choice`,
    });
    const options = [
        ...question.options.map((option, optionIndex) => ({
            value: String(optionIndex),
            label: option.label,
            description: option.description,
            badge:
                question.recommended === optionIndex
                    ? questionsCopy.recommended
                    : undefined,
        })),
        {
            value: OTHER_ANSWER,
            label: questionsCopy.other,
            description: questionsCopy.otherHint,
        },
    ];

    return (
        <div className="flex flex-col gap-2">
            <QuestionHeading index={index} question={question} />
            <HookFormRadioGroup<CardQuestionsFormValues>
                label={question.question}
                name={`answers.${index}.choice`}
                options={options}
                required
            />
            {choice === OTHER_ANSWER ? (
                <HookFormTextarea<CardQuestionsFormValues>
                    label={fillMessage(questionsCopy.otherLabel, {
                        number: index + 1,
                    })}
                    name={`answers.${index}.text`}
                    required
                />
            ) : null}
        </div>
    );
}

function AnswerForm({
    questions,
    isSubmitting,
    onAnswer,
    questionsCopy,
    submitLabel,
}: Pick<CardQuestionsProps, "questions" | "isSubmitting" | "onAnswer"> & {
    questionsCopy: QuestionsCopy;
    submitLabel: string;
}) {
    const { dictionary } = getDictionary();
    const schema = useMemo(
        () => buildCardQuestionsSchema(dictionary),
        [dictionary]
    );
    const form = useForm<CardQuestionsFormValues>({
        resolver: zodResolver(schema),
        defaultValues: initialQuestionAnswers(questions),
    });

    const onSubmit = async (values: CardQuestionsFormValues) => {
        try {
            await onAnswer(toAnswers(values));
        } catch {
            // The mutation already showed the error and reloads the card.
        }
    };

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-5"
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
            >
                {questions.map((question, index) => (
                    <AnswerQuestionField
                        index={index}
                        key={`${index}-${question.header}`}
                        question={question}
                        questionsCopy={questionsCopy}
                    />
                ))}
                <div
                    className="fixed inset-x-0 bottom-0 z-10 border-border border-t bg-background/95 p-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
                    data-sticky-action-bar=""
                >
                    <Button
                        className="w-full md:w-auto"
                        loading={isSubmitting}
                        type="submit"
                    >
                        {submitLabel}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

/** The questions an agent left on the card, above the tabs until someone answers them. */
export function CardQuestions({
    questions,
    stageKey,
    config,
    canAnswer,
    isSubmitting,
    onAnswer,
    resumes,
    boardsDictionary,
}: CardQuestionsProps) {
    const titleId = useId();
    const questionsCopy = boardsDictionary.cardDetail.questions;
    const stage =
        config.stages.find((candidate) => candidate.key === stageKey)?.column ??
        stageKey;
    const title =
        questions.length === 1
            ? fillMessage(questionsCopy.titleOne, { stage })
            : fillMessage(questionsCopy.titleOther, {
                  stage,
                  count: questions.length,
              });

    return (
        <Card
            aria-labelledby={titleId}
            className="gap-5 border-warning p-5"
            role="region"
        >
            <div className="flex flex-col gap-1">
                <h2 className="font-semibold text-lg" id={titleId}>
                    {title}
                </h2>
                {canAnswer ? (
                    <p className="text-muted-foreground text-sm">
                        {questionsCopy.subtitle}
                    </p>
                ) : null}
            </div>
            {canAnswer ? (
                <AnswerForm
                    isSubmitting={isSubmitting}
                    onAnswer={onAnswer}
                    questions={questions}
                    questionsCopy={questionsCopy}
                    submitLabel={
                        resumes
                            ? fillMessage(questionsCopy.submitAndResume, {
                                  column: stage,
                              })
                            : questionsCopy.submit
                    }
                />
            ) : (
                <>
                    {questions.map((question, index) => (
                        <ReadOnlyQuestion
                            index={index}
                            key={`${index}-${question.header}`}
                            question={question}
                            questionsCopy={questionsCopy}
                        />
                    ))}
                    <p className="text-muted-foreground text-sm">
                        {questionsCopy.readOnly}
                    </p>
                </>
            )}
        </Card>
    );
}
