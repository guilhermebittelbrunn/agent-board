import type { Client } from "../../client/index";
import type { Response } from "../../client/type";
import type {
    BoardImportPreviewDTO,
    BoardReloadResultDTO,
    BoardViewDTO,
    CreateBoardRequest,
    ImportableRepositoryDTO,
    UpdateBoardStageSettingsRequest,
} from "../../types";

export default class BoardActions {
    // biome-ignore lint/style/noParameterProperties: SDK client pattern
    constructor(private readonly client: Client) {
        this.client = client;
    }

    async list(): Promise<BoardViewDTO[]> {
        const { data } = await this.client.request<Response<BoardViewDTO[]>>({
            url: "/boards",
            method: "GET",
        });

        return data.data;
    }

    async findById(id: string): Promise<BoardViewDTO> {
        const { data } = await this.client.request<Response<BoardViewDTO>>({
            url: `/boards/${encodeURIComponent(id)}`,
            method: "GET",
        });

        return data.data;
    }

    async listRepositories(): Promise<ImportableRepositoryDTO[]> {
        const { data } = await this.client.request<
            Response<ImportableRepositoryDTO[]>
        >({
            url: "/boards/repositories",
            method: "GET",
        });

        return data.data;
    }

    async preview(repository: string): Promise<BoardImportPreviewDTO> {
        const { data } = await this.client.request<
            Response<BoardImportPreviewDTO>
        >({
            url: "/boards/preview",
            method: "GET",
            params: { repository },
        });

        return data.data;
    }

    async create(body: CreateBoardRequest): Promise<BoardViewDTO> {
        const { data } = await this.client.request<Response<BoardViewDTO>>({
            url: "/boards",
            method: "POST",
            data: body,
        });

        return data.data;
    }

    async reload(id: string): Promise<BoardReloadResultDTO> {
        const { data } = await this.client.request<
            Response<BoardReloadResultDTO>
        >({
            url: `/boards/${encodeURIComponent(id)}/reload`,
            method: "POST",
        });

        return data.data;
    }

    async updateStageSettings(
        id: string,
        body: UpdateBoardStageSettingsRequest
    ): Promise<BoardViewDTO> {
        const { data } = await this.client.request<Response<BoardViewDTO>>({
            url: `/boards/${encodeURIComponent(id)}/stage-settings`,
            method: "PATCH",
            data: body,
        });

        return data.data;
    }
}
