import type { UploadedAttachmentDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    buildObjectPath,
    isStorageConfigured,
    putObject,
} from "@/(shared)/lib/storage";
import { parseUploadedAttachment } from "@/(shared)/validation/attachment.schema";
import { requireBoardApi } from "@/app/(guards)/board";

const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code } }, { status });

/** Stores one file for a spec draft under the uploader's prefix; the draft links it later. */
export const POST = requireBoardApi("trigger", async (req, ctx) => {
    if (!isStorageConfigured()) {
        return errorResponse(
            "STORAGE_NOT_CONFIGURED",
            HTTP_STATUS.SERVICE_UNAVAILABLE
        );
    }

    const parsed = await parseUploadedAttachment(req);
    if (!parsed.ok) {
        return parsed.response;
    }

    const { body, contentType, extension, name, size } = parsed.value;
    const path = buildObjectPath(ctx.subjectProfile.id, extension);
    try {
        await putObject(path, body, contentType);
    } catch {
        return errorResponse("UPLOAD_FAILED", HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    const data: UploadedAttachmentDTO = { path, name, contentType, size };
    return Response.json({ data }, { status: HTTP_STATUS.CREATED });
});
