import { describe, expect, it, vi } from "vitest";

const UPLOAD_PREFIX = "uploads";
const STORAGE_OBJECT_PATH_RE =
    /^uploads\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

// Not `importActual`: the real module reaches Firebase Admin through `server-only`,
// which refuses to load outside a server component.
vi.mock("@/(shared)/lib/storage", () => ({
    isStorageObjectPath: (value: string) => STORAGE_OBJECT_PATH_RE.test(value),
    isOwnedBy: (path: string, ownerId: string) =>
        path.startsWith(`${UPLOAD_PREFIX}/${ownerId}/`),
}));

const {
    isAbsoluteHttpUrl,
    isAllowedExternalImageUrl,
    isUsablePhotoReference,
    normalizePhotoReference,
} = await import("@/(shared)/lib/photo-reference");

const OWNER_ID = "p2";
const OWN_OBJECT = `uploads/${OWNER_ID}/9f1c8e30-4b7a-4c21-9f2a-3c5b0d8e1a44.webp`;
const OTHER_OBJECT =
    "uploads/someone-else/9f1c8e30-4b7a-4c21-9f2a-3c5b0d8e1a44.webp";
const GOOGLE_PHOTO_URL = "https://lh3.googleusercontent.com/a/photo-id";
/** Hosts the panel's CSP would never render, and URL shapes that dodge a host check. */
const REFUSED_EXTERNAL_URLS = [
    "https://cdn.example.com/legacy.png",
    "http://example.com/a.jpg",
    "http://lh3.googleusercontent.com/a/photo-id",
    "https://lh3.googleusercontent.com:8443/a/photo-id",
    "https://user:secret@lh3.googleusercontent.com/a/photo-id",
    "https://lh4.googleusercontent.com/a/photo-id",
    "https://lh3.googleusercontent.com.evil.example/a/photo-id",
];

describe("what counts as a usable reference", () => {
    const usable = [GOOGLE_PHOTO_URL, OWN_OBJECT];
    const refused = [
        ...REFUSED_EXTERNAL_URLS,
        OTHER_OBJECT,
        "uploads/../../etc/passwd",
        `uploads/${OWNER_ID}x/9f1c8e30-4b7a-4c21-9f2a-3c5b0d8e1a44.webp`,
        `uploads/${OWNER_ID}/9f1c8e30-4b7a-4c21-9f2a-3c5b0d8e1a44.svg`,
        "just some text",
        "javascript:alert(1)",
    ];

    it.each(usable)("accepts %s", (photo) => {
        expect(isUsablePhotoReference(photo, OWNER_ID)).toBe(true);
    });

    it.each(refused)("refuses %s", (photo) => {
        expect(isUsablePhotoReference(photo, OWNER_ID)).toBe(false);
    });
});

describe("external image hosts", () => {
    it("accepts only https on the allowed host", () => {
        expect(isAllowedExternalImageUrl(GOOGLE_PHOTO_URL)).toBe(true);
        for (const url of REFUSED_EXTERNAL_URLS) {
            expect(isAllowedExternalImageUrl(url)).toBe(false);
        }
    });

    it("tells an absolute http url from an object path", () => {
        expect(isAbsoluteHttpUrl(GOOGLE_PHOTO_URL)).toBe(true);
        expect(isAbsoluteHttpUrl(OWN_OBJECT)).toBe(false);
    });
});

describe("normalizing the stored reference", () => {
    it("turns an empty or blank value into null", () => {
        expect(normalizePhotoReference("")).toBeNull();
        expect(normalizePhotoReference("   ")).toBeNull();
        expect(normalizePhotoReference(undefined)).toBeNull();
        expect(normalizePhotoReference(null)).toBeNull();
    });

    it("trims a real reference", () => {
        expect(normalizePhotoReference(` ${OWN_OBJECT} `)).toBe(OWN_OBJECT);
    });
});
