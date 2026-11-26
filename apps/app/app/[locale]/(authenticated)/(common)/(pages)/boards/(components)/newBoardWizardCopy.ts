import type { BoardImportPreviewDTO } from "@repo/sdk/src/types";
import type { BoardsDictionary } from "./boardConfigIssueMessage";

type ReadConfigCopy = BoardsDictionary["wizard"]["readConfig"];
type FooterCopy = BoardsDictionary["wizard"]["footer"];

/**
 * The preview only answers when the App reaches the repository and the person is admin on
 * it, and they only become the owner if nobody imported it yet.
 */
export function repositoryAccessLine(
    preview: BoardImportPreviewDTO | undefined,
    readConfigCopy: ReadConfigCopy
): string | null {
    return preview && preview.board === null
        ? readConfigCopy.repositoryLine
        : null;
}

export function blockedCreateHint(
    preview: BoardImportPreviewDTO,
    footerCopy: FooterCopy
): string | null {
    switch (preview.status) {
        case "invalid":
            return footerCopy.fixToContinue;
        case "missing":
            return footerCopy.addFileToContinue;
        default:
            return null;
    }
}
