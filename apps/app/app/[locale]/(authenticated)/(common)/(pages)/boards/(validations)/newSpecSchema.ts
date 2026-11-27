import type { globalTranslations } from "@repo/internationalization/translations/global";
import {
    ATTACHMENT_MAX_BYTES,
    ATTACHMENT_TYPES,
    DRAFT_REQUEST_MAX,
} from "@repo/kanban-contract";
import { z } from "zod";
import { fillMessage } from "../(components)/boardConfigIssueMessage";

type Dictionary = (typeof globalTranslations)[keyof typeof globalTranslations];

export type NewSpecFormValues = { text: string };

const BYTES_PER_KIB = 1024;
export const ATTACHMENT_MAX_MB =
    ATTACHMENT_MAX_BYTES / (BYTES_PER_KIB * BYTES_PER_KIB);

// Browsers often leave `type` empty for .md files, so text files are also told by extension.
const TEXT_EXTENSIONS = [".txt", ".md"] as const;

/** `accept` of the file picker: the exact types plus the text extensions. */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_TYPES, ...TEXT_EXTENSIONS].join(
    ","
);

export function buildNewSpecFormSchema(dictionary: Dictionary) {
    const newSpecCopy = dictionary.apps.app.pages.common.boards.drafts.newSpec;
    return z.object({
        text: z
            .string()
            .trim()
            .min(1, newSpecCopy.textRequired)
            .max(
                DRAFT_REQUEST_MAX,
                fillMessage(newSpecCopy.textTooLong, { max: DRAFT_REQUEST_MAX })
            ),
    });
}

/**
 * Checks a picked file early so the person sees the problem before uploading; the API
 * checks the bytes again and has the last word.
 */
export function attachmentFileError(
    file: Pick<File, "name" | "size" | "type">,
    dictionary: Dictionary
): string | null {
    const newSpecCopy = dictionary.apps.app.pages.common.boards.drafts.newSpec;
    const lowerName = file.name.toLowerCase();
    const knownType =
        (ATTACHMENT_TYPES as readonly string[]).includes(file.type) ||
        TEXT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
    if (!knownType) {
        return fillMessage(newSpecCopy.typeNotAllowed, { name: file.name });
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
        return fillMessage(newSpecCopy.tooLarge, {
            name: file.name,
            size: ATTACHMENT_MAX_MB,
        });
    }
    return null;
}
