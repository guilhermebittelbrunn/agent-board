import { Suspense } from "react";
import { panelPageMetadata } from "@/lib/server/panelMetadata";
import { NewBoardClient } from "./NewBoardClient";

export const generateMetadata = panelPageMetadata("/boards/new");

export default function NewBoardPage() {
    return (
        <Suspense>
            <NewBoardClient />
        </Suspense>
    );
}
