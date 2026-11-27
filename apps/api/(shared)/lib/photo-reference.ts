import { isOwnedBy, isStorageObjectPath } from "./storage";

const ABSOLUTE_URL_RE = /^https?:\/\//i;

export const isAbsoluteHttpUrl = (value: string): boolean =>
    ABSOLUTE_URL_RE.test(value);

/**
 * The only hosts an external image may come from. This has to match the panel's CSP
 * `img-src` in `apps/app/proxy.ts`: a URL on any other host would be stored and never
 * render, so a fork adding its own CDN edits both lists together.
 */
const EXTERNAL_IMAGE_HOSTS = new Set(["lh3.googleusercontent.com"]);

export const isAllowedExternalImageUrl = (value: string): boolean => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return (
        url.protocol === "https:" &&
        url.username === "" &&
        url.password === "" &&
        url.port === "" &&
        EXTERNAL_IMAGE_HOSTS.has(url.hostname)
    );
};

/** Empty string means "no photo"; the stored field is nullable, the form value is not. */
export const normalizePhotoReference = (
    value: string | null | undefined
): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};

/** An object in the bucket that this owner uploaded — the only kind we sign or delete. */
export const isOwnStorageObject = (value: string, ownerId: string): boolean =>
    isStorageObjectPath(value) && isOwnedBy(value, ownerId);

/**
 * Decides fail-closed: a reference is usable only as an https URL on an allowed host or
 * as an object under the owner's own prefix. Anything else is refused, so pointing a
 * record at someone else's object can never reach the document and be signed on the way
 * back out.
 */
export const isUsablePhotoReference = (
    value: string,
    ownerId: string
): boolean =>
    isAllowedExternalImageUrl(value) || isOwnStorageObject(value, ownerId);
