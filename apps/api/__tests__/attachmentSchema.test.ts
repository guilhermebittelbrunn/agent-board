import { crc32 } from "node:zlib";
import { ATTACHMENT_MAX_BYTES } from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import { parseUploadedAttachment } from "@/(shared)/validation/attachment.schema";

const U32_BYTES = 4;
const WHITESPACE = /\s+/g;
const u32 = (value: number) => {
    const bytes = Buffer.alloc(U32_BYTES);
    bytes.writeUInt32BE(value);
    return bytes;
};
const hex = (value: string) =>
    Buffer.from(value.replace(WHITESPACE, ""), "hex");
const chunk = (type: string, data: Buffer = Buffer.alloc(0)) => {
    const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
    return Buffer.concat([
        u32(data.length),
        typeAndData,
        u32(crc32(typeAndData)),
    ]);
};

const PNG = Buffer.concat([
    hex("89504e470d0a1a0a"),
    chunk("IHDR", hex("00000001 00000001 08 03 00 00 00")),
    chunk("PLTE", hex("ff0000")),
    chunk("tEXt", Buffer.from("Comment\0GPS 12.34N", "latin1")),
    chunk("IDAT", hex("789c63600000000200 01")),
    chunk("IEND"),
]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "latin1");

function upload(bytes: Buffer, name: string, type = "") {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(bytes)], name, { type }));
    return new Request("http://localhost:3002/boards/b1/attachments", {
        method: "POST",
        body: form,
    });
}

async function codeOf(
    result: Awaited<ReturnType<typeof parseUploadedAttachment>>
) {
    if (result.ok) {
        return "accepted";
    }
    const body = (await result.response.json()) as { error: { code: string } };
    return body.error.code;
}

describe("parseUploadedAttachment", () => {
    it("accepts a PNG and strips its metadata", async () => {
        const result = await parseUploadedAttachment(
            upload(PNG, "print.png", "image/png")
        );

        expect(result.ok && result.value.contentType).toBe("image/png");
        expect(result.ok && result.value.extension).toBe("png");
        expect(result.ok && result.value.body.includes("GPS")).toBe(false);
    });

    it("accepts a PDF by its bytes", async () => {
        const result = await parseUploadedAttachment(
            upload(PDF, "pedido.pdf", "application/pdf")
        );

        expect(result.ok && result.value).toMatchObject({
            contentType: "application/pdf",
            extension: "pdf",
            name: "pedido.pdf",
        });
    });

    it("accepts UTF-8 text by its extension", async () => {
        const text = Buffer.from("# Notas\n\nAção pendente.\n", "utf8");
        const markdown = await parseUploadedAttachment(
            upload(text, "notas.md")
        );
        const plain = await parseUploadedAttachment(
            upload(text, "notas.txt", "text/plain")
        );

        expect(markdown.ok && markdown.value.contentType).toBe("text/markdown");
        expect(plain.ok && plain.value.contentType).toBe("text/plain");
    });

    it("refuses binary content, invalid UTF-8 and a fake PDF", async () => {
        const binary = hex("41 00 42");
        const invalidUtf8 = hex("c3 28");

        expect(
            await codeOf(await parseUploadedAttachment(upload(binary, "a.txt")))
        ).toBe("SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED");
        expect(
            await codeOf(
                await parseUploadedAttachment(upload(invalidUtf8, "a.md"))
            )
        ).toBe("SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED");
        expect(
            await codeOf(
                await parseUploadedAttachment(
                    upload(Buffer.from("not a pdf"), "a.pdf", "application/pdf")
                )
            )
        ).toBe("SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED");
    });

    it("refuses a type the bytes contradict and an unknown extension", async () => {
        expect(
            await codeOf(
                await parseUploadedAttachment(upload(PDF, "a.png", "image/png"))
            )
        ).toBe("SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED");
        expect(
            await codeOf(
                await parseUploadedAttachment(upload(Buffer.from("x"), "a.exe"))
            )
        ).toBe("SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED");
    });

    it("refuses a file one byte over 3 MiB", async () => {
        const oversized = Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, "a");

        expect(
            await codeOf(
                await parseUploadedAttachment(upload(oversized, "big.txt"))
            )
        ).toBe("SPEC_DRAFT_ATTACHMENT_TOO_LARGE");
    });

    it("refuses a body without a file", async () => {
        const form = new FormData();
        form.append("other", "x");
        const request = new Request("http://localhost/x", {
            method: "POST",
            body: form,
        });

        expect(await codeOf(await parseUploadedAttachment(request))).toBe(
            "UPLOAD_FILE_MISSING"
        );
    });
});
