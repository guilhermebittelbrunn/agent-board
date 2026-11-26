import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { PageSkeleton } from "@/shared/components/ui/PageSkeleton";

const SKELETON_COLUMNS = ["tasks", "stage", "done"];

export default function Loading() {
    return (
        <PageSkeleton actions description>
            <div className="flex w-full flex-col gap-6 md:flex-row">
                {SKELETON_COLUMNS.map((column) => (
                    <div
                        className="flex flex-col gap-3 md:w-72 md:shrink-0"
                        key={column}
                    >
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </div>
                ))}
            </div>
        </PageSkeleton>
    );
}
