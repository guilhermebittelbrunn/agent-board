import type { Client } from "../../client/index";
import type { Response } from "../../client/type";
import type {
    CreateSpecDraftRequest,
    CreateSpecDraftResultDTO,
    UploadedAttachmentDTO,
} from "../../types";

const boardPath = (boardId: string) => `/boards/${encodeURIComponent(boardId)}`;

export default class BoardDraftActions {
    // biome-ignore lint/style/noParameterProperties: SDK client pattern
    constructor(private readonly client: Client) {
        this.client = client;
    }

    async uploadAttachment(
        boardId: string,
        file: File
    ): Promise<UploadedAttachmentDTO> {
        const form = new FormData();
        form.append("file", file);

        // No explicit Content-Type: only the browser can write the multipart boundary.
        const { data } = await this.client.request<
            Response<UploadedAttachmentDTO>
        >({
            url: `${boardPath(boardId)}/attachments`,
            method: "POST",
            data: form,
        });

        return data.data;
    }

    async create(
        boardId: string,
        body: CreateSpecDraftRequest
    ): Promise<CreateSpecDraftResultDTO> {
        const { data } = await this.client.request<
            Response<CreateSpecDraftResultDTO>
        >({
            url: `${boardPath(boardId)}/drafts`,
            method: "POST",
            data: body,
        });

        return data.data;
    }
}
