import { globalTranslations } from "@repo/internationalization/translations/global";
import { ATTACHMENT_MAX_BYTES, DRAFT_REQUEST_MAX } from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import {
    attachmentFileError,
    buildNewSpecFormSchema,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(validations)/newSpecSchema";

const dictionary = globalTranslations["pt-br"];
const schema = buildNewSpecFormSchema(dictionary);

describe("new spec form", () => {
    it("asks for a request that is not blank", () => {
        const result = schema.safeParse({ text: "   " });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(
            "Descreva o que você quer construir."
        );
    });

    it("accepts up to the request limit and refuses one character more", () => {
        expect(
            schema.safeParse({ text: "a".repeat(DRAFT_REQUEST_MAX) }).success
        ).toBe(true);
        const tooLong = schema.safeParse({
            text: "a".repeat(DRAFT_REQUEST_MAX + 1),
        });
        expect(tooLong.error?.issues[0]?.message).toBe(
            `O pedido passa de ${DRAFT_REQUEST_MAX} caracteres.`
        );
    });
});

describe("attachmentFileError", () => {
    it("accepts images, PDFs and text files, telling markdown by its extension", () => {
        for (const file of [
            { name: "print.png", type: "image/png", size: 10 },
            { name: "pedido.pdf", type: "application/pdf", size: 10 },
            { name: "notas.md", type: "", size: 10 },
            { name: "notas.TXT", type: "", size: 10 },
        ]) {
            expect(attachmentFileError(file, dictionary)).toBeNull();
        }
    });

    it("names the file that is too large or of another type", () => {
        expect(
            attachmentFileError(
                {
                    name: "video.png",
                    type: "image/png",
                    size: ATTACHMENT_MAX_BYTES + 1,
                },
                dictionary
            )
        ).toBe("video.png passa de 3 MB.");
        expect(
            attachmentFileError(
                {
                    name: "planilha.xlsx",
                    type: "application/vnd.ms-excel",
                    size: 1,
                },
                dictionary
            )
        ).toContain("planilha.xlsx");
    });
});
