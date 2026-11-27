import { FormSkeleton } from "@/shared/components/ui/FormSkeleton";
import { PageSkeleton } from "@/shared/components/ui/PageSkeleton";

export default function Loading() {
    return (
        <PageSkeleton description>
            <FormSkeleton />
        </PageSkeleton>
    );
}
