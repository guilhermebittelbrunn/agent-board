import type { Client } from "../../client/index";
import type { Response } from "../../client/type";
import type { CreateCycleRequest, CycleDetailDTO, CycleDTO } from "../../types";

const cyclesPath = (boardId: string) =>
    `/boards/${encodeURIComponent(boardId)}/cycles`;

const cyclePath = (boardId: string, cycleId: string) =>
    `${cyclesPath(boardId)}/${encodeURIComponent(cycleId)}`;

export default class BoardCycleActions {
    // biome-ignore lint/style/noParameterProperties: SDK client pattern
    constructor(private readonly client: Client) {
        this.client = client;
    }

    async list(boardId: string): Promise<CycleDTO[]> {
        const { data } = await this.client.request<Response<CycleDTO[]>>({
            url: cyclesPath(boardId),
            method: "GET",
        });

        return data.data;
    }

    async findById(boardId: string, cycleId: string): Promise<CycleDetailDTO> {
        const { data } = await this.client.request<Response<CycleDetailDTO>>({
            url: cyclePath(boardId, cycleId),
            method: "GET",
        });

        return data.data;
    }

    async create(boardId: string, body: CreateCycleRequest): Promise<CycleDTO> {
        const { data } = await this.client.request<Response<CycleDTO>>({
            url: cyclesPath(boardId),
            method: "POST",
            data: body,
        });

        return data.data;
    }

    async stop(boardId: string, cycleId: string): Promise<CycleDTO> {
        const { data } = await this.client.request<Response<CycleDTO>>({
            url: `${cyclePath(boardId, cycleId)}/stop`,
            method: "POST",
        });

        return data.data;
    }
}
