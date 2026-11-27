const MAX_NAME = 200;
const FIRST_PRINTABLE_CODE = 32;

/** Drops control characters and path separators: the name is shown on screen and handed to the agent. */
export function cleanAttachmentName(name: string, extension: string): string {
    const cleaned = Array.from(name)
        .filter(
            (char) =>
                char.charCodeAt(0) >= FIRST_PRINTABLE_CODE &&
                char !== "/" &&
                char !== "\\"
        )
        .join("")
        .trim()
        .slice(0, MAX_NAME);
    return cleaned === "" ? `attachment.${extension}` : cleaned;
}
