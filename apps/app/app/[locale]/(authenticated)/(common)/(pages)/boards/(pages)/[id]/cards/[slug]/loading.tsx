import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { PageSkeleton } from "@/shared/components/ui/PageSkeleton";

export default function Loading() {
    return (
        <PageSkeleton description>
            <div className="flex w-full flex-col gap-6">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-96 w-full rounded-xl" />
            </div>
        </PageSkeleton>
    );
}
