"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { getDictionary } from "@repo/internationalization/client";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import { handleClientError } from "@repo/shared/utils/helpers/handleClientError";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { COMMON_ROUTES } from "../../../../paths";
import { BoardCard } from "../../(components)/BoardCard";
import { BoardsFirstAccess } from "../../(components)/BoardsFirstAccess";
import { useListBoards } from "../../(hooks)/useListBoards";

export function BoardsListClient() {
    const { data: boards, isLoading, error } = useListBoards();
    const router = useRouter();
    const { dictionary, locale } = getDictionary();
    const routes = COMMON_ROUTES(dictionary, locale);
    const boardsDictionary = dictionary.apps.app.pages.common.boards;
    const listCopy = boardsDictionary.list;
    const firstAccessCopy = boardsDictionary.firstAccess;

    const loadError = error
        ? handleClientError(new FormattedError(error, locale))
        : null;
    const isEmpty = !(isLoading || loadError) && boards.length === 0;

    const newBoardButton = (
        <Button
            onClick={() => router.push(routes.boards.create.url)}
            type="button"
        >
            <PlusIcon />
            <span className="sr-only sm:not-sr-only">{listCopy.newBoard}</span>
        </Button>
    );

    return (
        <>
            <Header page={routes.boards.list.label} />
            <Container
                header={
                    isEmpty ? (
                        <PageHeader
                            description={firstAccessCopy.subtitle}
                            title={firstAccessCopy.title}
                        />
                    ) : (
                        <PageHeader
                            actions={newBoardButton}
                            description={listCopy.subtitle}
                            title={listCopy.title}
                        />
                    )
                }
                loadError={loadError}
                loading={isLoading}
            >
                <div className="flex w-full flex-col gap-6">
                    {isEmpty ? (
                        <BoardsFirstAccess
                            boardsDictionary={boardsDictionary}
                            newBoardUrl={routes.boards.create.url}
                        />
                    ) : (
                        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {boards.map((board) => (
                                <li key={board.id}>
                                    <BoardCard
                                        board={board}
                                        boardsDictionary={boardsDictionary}
                                        href={
                                            routes.boards.detail(board.id).url
                                        }
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Container>
        </>
    );
}
