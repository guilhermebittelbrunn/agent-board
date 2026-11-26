import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { PageSkeleton } from "@/shared/components/ui/PageSkeleton";

const SKELETON_CARDS = ["first", "second", "third"];

export default function Loading() {
    return (
        <PageSkeleton actions description>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {SKELETON_CARDS.map((card) => (
                    <Skeleton className="h-28 w-full rounded-xl" key={card} />
                ))}
            </div>
        </PageSkeleton>
    );
}
