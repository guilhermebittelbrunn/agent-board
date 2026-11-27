import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { PageSkeleton } from "@/shared/components/ui/PageSkeleton";
import { TableSkeleton } from "@/shared/components/ui/TableSkeleton";

export default function Loading() {
    return (
        <PageSkeleton description>
            <div className="flex w-full flex-col gap-6">
                <Skeleton className="h-36 w-full rounded-xl" />
                <TableSkeleton />
            </div>
        </PageSkeleton>
    );
}
