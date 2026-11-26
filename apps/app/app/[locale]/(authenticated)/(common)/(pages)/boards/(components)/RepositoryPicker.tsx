import { Badge } from "@repo/design-system/components/ui/badge";
import {
    Button,
    buttonVariants,
} from "@repo/design-system/components/ui/button";
import {
    Item,
    ItemActions,
    ItemContent,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from "@repo/design-system/components/ui/item";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import type { ImportableRepositoryDTO } from "@repo/sdk/src/types";
import { GithubIcon } from "lucide-react";
import Link from "next/link";
import { LoadErrorState } from "@/shared/components/ui/LoadErrorState";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

const SKELETON_ROWS = ["first", "second", "third"];

type RepositoryPickerProps = {
    repositories: ImportableRepositoryDTO[];
    isLoading: boolean;
    loadError: string | null;
    onChoose: (fullName: string) => void;
    boardUrl: (boardId: string) => string;
    boardsDictionary: BoardsDictionary;
};

export function RepositoryPicker({
    repositories,
    isLoading,
    loadError,
    onChoose,
    boardUrl,
    boardsDictionary,
}: RepositoryPickerProps) {
    const repositoryCopy = boardsDictionary.wizard.repository;

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {SKELETON_ROWS.map((row) => (
                    <Skeleton className="h-16 w-full" key={row} />
                ))}
            </div>
        );
    }
    if (loadError) {
        return <LoadErrorState message={loadError} />;
    }
    if (repositories.length === 0) {
        return <LoadErrorState message={repositoryCopy.empty} />;
    }

    return (
        <ItemGroup className="gap-2">
            {repositories.map((repository) => {
                const { board } = repository;
                return (
                    <Item
                        className="bg-card"
                        key={repository.fullName}
                        variant="outline"
                    >
                        <ItemMedia>
                            <GithubIcon aria-hidden className="size-5" />
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                            <ItemTitle className="break-words">
                                {repository.fullName}
                                {repository.private ? (
                                    <Badge variant="secondary">
                                        {repositoryCopy.private}
                                    </Badge>
                                ) : null}
                            </ItemTitle>
                        </ItemContent>
                        <ItemActions>
                            {board === "taken" ? (
                                <Badge variant="outline">
                                    {repositoryCopy.taken}
                                </Badge>
                            ) : null}
                            {board !== null && board !== "taken" ? (
                                <Link
                                    className={buttonVariants({
                                        variant: "outline",
                                        size: "sm",
                                    })}
                                    href={boardUrl(board.boardId)}
                                >
                                    {repositoryCopy.openBoard}
                                </Link>
                            ) : null}
                            {board === null ? (
                                <Button
                                    onClick={() =>
                                        onChoose(repository.fullName)
                                    }
                                    size="sm"
                                    type="button"
                                >
                                    {repositoryCopy.choose}
                                </Button>
                            ) : null}
                        </ItemActions>
                    </Item>
                );
            })}
        </ItemGroup>
    );
}
