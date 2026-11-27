import {
    ATTACHMENT_MAX_BYTES,
    type AttachmentType,
} from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { cleanAttachmentName } from "@/(shared)/lib/attachment-name";
import { stripImageMetadata } from "@/(shared)/lib/image-metadata";
import { readCappedBody } from "@/(shared)/lib/read-capped-body";
import {
    sniffImageType,
    UPLOAD_IMAGE_EXTENSION,
    type UploadImageType,
} from "./file.schema";

const BYTES_PER_KIB = 1024;
const MULTIPART_ENVELOPE_ALLOWANCE_KIB = 64;
const DECLARED_BODY_MAX_BYTES =
    ATTACHMENT_MAX_BYTES + MULTIPART_ENVELOPE_ALLOWANCE_KIB * BYTES_PER_KIB;
const SNIFF_BYTES = 12;
const PDF_MAGIC = "%PDF-";
const NULL_BYTE = 0;

const TEXT_EXTENSIONS: Record<string, AttachmentType> = {
    txt: "text/plain",
    md: "text/markdown",
};

const DECLARED_TEXT_TYPES = new Set([
    "text/plain",
    "text/markdown",
    "text/x-markdown",
]);

export type ParsedAttachment = {
    body: Buffer;
    contentType: AttachmentType;
    extension: string;
    name: string;
    size: number;
};

type Refusal = { ok: false; response: Response };

const refuse = (code: string, status: number): Refusal => ({
    ok: false,
    response: Response.json({ error: { code } }, { status }),
});

// The rest of an oversized body is never read, so the socket is closed right away instead
// of waiting for a body nobody will consume.
const refuseTooLarge = (): Refusal => ({
    ok: false,
    response: Response.json(
        { error: { code: "SPEC_DRAFT_ATTACHMENT_TOO_LARGE" } },
        {
            status: HTTP_STATUS.PAYLOAD_TOO_LARGE,
            headers: { connection: "close" },
        }
    ),
});

const refuseType = (): Refusal =>
    refuse(
        "SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED",
        HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE
    );

const isTypeDeclared = (type: string): boolean =>
    type !== "" && type !== "application/octet-stream";

const extensionOf = (name: string): string => {
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};

const exceedsDeclaredLength = (req: Request): boolean => {
    const declared = Number(req.headers.get("content-length"));
    return Number.isFinite(declared) && declared > DECLARED_BODY_MAX_BYTES;
};

function isPlainText(body: Buffer): boolean {
    if (body.includes(NULL_BYTE)) {
        return false;
    }
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(body);
        return true;
    } catch {
        return false;
    }
}

type Classified =
    | { kind: "image"; type: UploadImageType }
    | { kind: "pdf" }
    | { kind: "text"; type: AttachmentType; extension: string }
    | null;

/** The bytes decide images and PDFs; text has no signature, so its extension and content do. */
function classify(file: File, body: Buffer): Classified {
    const image = sniffImageType(body.subarray(0, SNIFF_BYTES));
    if (image) {
        return isTypeDeclared(file.type) && file.type !== image
            ? null
            : { kind: "image", type: image };
    }
    if (body.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC) {
        return isTypeDeclared(file.type) && file.type !== "application/pdf"
            ? null
            : { kind: "pdf" };
    }
    const extension = extensionOf(file.name);
    const textType = TEXT_EXTENSIONS[extension];
    if (textType === undefined) {
        return null;
    }
    if (isTypeDeclared(file.type) && !DECLARED_TEXT_TYPES.has(file.type)) {
        return null;
    }
    return isPlainText(body)
        ? { kind: "text", type: textType, extension }
        : null;
}

function accepted(
    file: File,
    body: Buffer,
    contentType: AttachmentType,
    extension: string
): { ok: true; value: ParsedAttachment } {
    return {
        ok: true,
        value: {
            body,
            contentType,
            extension,
            name: cleanAttachmentName(file.name, extension),
            size: body.length,
        },
    };
}

/**
 * Reads one spec draft attachment from a multipart body: an image (metadata stripped), a PDF
 * or a UTF-8 text file. The stored type always comes from the bytes, never from the client.
 */
export async function parseUploadedAttachment(
    req: Request
): Promise<{ ok: true; value: ParsedAttachment } | Refusal> {
    if (exceedsDeclaredLength(req)) {
        return refuseTooLarge();
    }
    if (!req.body) {
        return refuse("UPLOAD_FILE_MISSING", HTTP_STATUS.BAD_REQUEST);
    }

    let form: FormData;
    try {
        const bytes = await readCappedBody(req.body, DECLARED_BODY_MAX_BYTES);
        if (!bytes) {
            return refuseTooLarge();
        }
        form = await new Response(bytes, {
            headers: { "content-type": req.headers.get("content-type") ?? "" },
        }).formData();
    } catch {
        return refuse("UPLOAD_FILE_MISSING", HTTP_STATUS.BAD_REQUEST);
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
        return refuse("UPLOAD_FILE_MISSING", HTTP_STATUS.BAD_REQUEST);
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
        return refuseTooLarge();
    }

    const body = Buffer.from(await file.arrayBuffer());
    const kind = classify(file, body);
    if (kind === null) {
        return refuseType();
    }
    if (kind.kind === "pdf") {
        return accepted(file, body, "application/pdf", "pdf");
    }
    if (kind.kind === "text") {
        return accepted(file, body, kind.type, kind.extension);
    }
    let stripped: Buffer | null;
    try {
        stripped = stripImageMetadata(body, kind.type);
    } catch {
        stripped = null;
    }
    return stripped
        ? accepted(file, stripped, kind.type, UPLOAD_IMAGE_EXTENSION[kind.type])
        : refuseType();
}
