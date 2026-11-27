"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { FileIcon, FileTextIcon, ImageIcon, XIcon } from "lucide-react";
import { type BoardsDictionary, fillMessage } from "./boardConfigIssueMessage";

export type DraftAttachmentStatus =
    | "pending"
    | "uploading"
    | "uploaded"
    | "error";

export type DraftAttachmentItem = {
    key: string;
    name: string;
    size: number;
    contentType: string;
    status?: DraftAttachmentStatus;
    error?: string | null;
};

type DraftAttachmentListProps = {
    items: DraftAttachmentItem[];
    locale: string;
    boardsDictionary: BoardsDictionary;
    /** Absent on the card page, where attachments are read-only. */
    onRemove?: (key: string) => void;
};

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;

function formatSize(size: number, locale: string): string {
    const inMegabytes = size >= BYTES_PER_MB;
    return new Intl.NumberFormat(locale, {
        style: "unit",
        unit: inMegabytes ? "megabyte" : "kilobyte",
        unitDisplay: "short",
        maximumFractionDigits: inMegabytes ? 1 : 0,
    }).format(
        inMegabytes ? size / BYTES_PER_MB : Math.max(1, size / BYTES_PER_KB)
    );
}

function TypeIcon({ contentType }: { contentType: string }) {
    const className = "size-4 shrink-0 text-muted-foreground";
    if (contentType.startsWith("image/")) {
        return <ImageIcon aria-hidden className={className} />;
    }
    if (contentType.startsWith("text/") || contentType === "") {
        return <FileTextIcon aria-hidden className={className} />;
    }
    return <FileIcon aria-hidden className={className} />;
}

/** Name, size and type of each attachment; the dialog also shows upload state and a remove button. */
export function DraftAttachmentList({
    items,
    locale,
    boardsDictionary,
    onRemove,
}: DraftAttachmentListProps) {
    const newSpecCopy = boardsDictionary.drafts.newSpec;
    if (items.length === 0) {
        return null;
    }
    return (
        <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
                <li
                    className={cn(
                        "flex flex-col gap-1 rounded-md border px-3 py-2",
                        item.status === "error" && "border-destructive"
                    )}
                    key={item.key}
                >
                    <div className="flex items-center gap-2">
                        <TypeIcon contentType={item.contentType} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                            {item.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                            {item.status === "uploading"
                                ? newSpecCopy.uploading
                                : formatSize(item.size, locale)}
                        </span>
                        {onRemove && item.status !== "uploading" ? (
                            <Button
                                aria-label={fillMessage(
                                    newSpecCopy.removeAttachment,
                                    { name: item.name }
                                )}
                                className="size-7"
                                onClick={() => onRemove(item.key)}
                                size="icon"
                                type="button"
                                variant="ghost"
                            >
                                <XIcon aria-hidden className="size-4" />
                            </Button>
                        ) : null}
                    </div>
                    {item.error ? (
                        <p className="text-destructive text-xs" role="alert">
                            {item.error}
                        </p>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}
