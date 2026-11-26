import { Card } from "@repo/design-system/components/ui/card";
import type { BoardRole, GithubRepoRole } from "@repo/kanban-contract";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

const GUIDE: { role: BoardRole; requires: GithubRepoRole }[] = [
    { role: "viewer", requires: "read" },
    { role: "operator", requires: "write" },
    { role: "maintainer", requires: "maintain" },
    { role: "owner", requires: "admin" },
];

type BoardRolesGuideProps = { boardsDictionary: BoardsDictionary };

export function BoardRolesGuide({ boardsDictionary }: BoardRolesGuideProps) {
    const guideCopy = boardsDictionary.members.guide;
    const [requiresBefore = "", requiresAfter = ""] =
        guideCopy.requires.split("{role}");

    return (
        <section className="flex flex-col gap-3">
            <h2 className="font-semibold text-lg">{guideCopy.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {GUIDE.map(({ role, requires }) => (
                    <Card className="gap-2 p-4" key={role}>
                        <h3 className="font-semibold">
                            {boardsDictionary.roles[role]}
                        </h3>
                        <p className="text-sm">{guideCopy[role]}</p>
                        <p className="text-muted-foreground text-xs">
                            {requiresBefore}
                            <code className="font-mono">{requires}</code>
                            {requiresAfter}
                        </p>
                    </Card>
                ))}
            </div>
        </section>
    );
}
