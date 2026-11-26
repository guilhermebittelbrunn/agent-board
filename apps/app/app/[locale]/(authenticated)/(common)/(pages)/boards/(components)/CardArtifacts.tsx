import { Card } from "@repo/design-system/components/ui/card";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import type { BoardConfig } from "@repo/kanban-contract";
import type { CardEventViewDTO } from "@repo/sdk/src/types";
import { FileText } from "lucide-react";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";
import { githubFileUrl } from "./githubFileUrl";
import { latestArtifacts } from "./latestArtifacts";
import { shortSha } from "./shortSha";

type CardArtifactsProps = {
    events: CardEventViewDTO[];
    owner: string;
    name: string;
    config: BoardConfig;
    boardsDictionary: BoardsDictionary;
};

const fileNameOf = (path: string) => path.split("/").at(-1) ?? path;

export function CardArtifacts({
    events,
    owner,
    name,
    config,
    boardsDictionary,
}: CardArtifactsProps) {
    const artifactsCopy = boardsDictionary.cardDetail.artifacts;
    const artifacts = latestArtifacts(events);

    if (artifacts.length === 0) {
        return (
            <Empty className="border border-border border-dashed">
                <EmptyHeader>
                    <EmptyTitle>{artifactsCopy.empty.title}</EmptyTitle>
                    <EmptyDescription>
                        {artifactsCopy.empty.body}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <ul className="flex flex-col gap-3">
            {artifacts.map((event) => {
                const { path, commitSha } = event.artifact;
                const stage =
                    config.stages.find(
                        (candidate) => candidate.key === event.stageKey
                    )?.column ?? event.stageKey;
                return (
                    <li key={path}>
                        <Card className="flex-row items-start gap-3 p-4">
                            <FileText
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            />
                            <div className="flex min-w-0 flex-col gap-1">
                                <a
                                    aria-label={fillMessage(
                                        artifactsCopy.openOnGithub,
                                        { path }
                                    )}
                                    className="font-medium text-primary text-sm underline-offset-4 hover:underline"
                                    href={githubFileUrl(
                                        owner,
                                        name,
                                        commitSha,
                                        path
                                    )}
                                    rel="noreferrer noopener"
                                    target="_blank"
                                >
                                    {fileNameOf(path)}
                                </a>
                                <span className="break-all font-mono text-muted-foreground text-xs">
                                    {path} · {shortSha(commitSha)}
                                </span>
                                {stage ? (
                                    <span className="text-muted-foreground text-xs">
                                        {fillMessage(artifactsCopy.stage, {
                                            stage,
                                        })}
                                    </span>
                                ) : null}
                            </div>
                        </Card>
                    </li>
                );
            })}
        </ul>
    );
}
