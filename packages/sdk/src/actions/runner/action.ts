import type { Client } from "../../client/index";
import type { Response } from "../../client/type";
import type { RunnerDTO, RunnerRegistrationDTO } from "../../types";

export default class RunnerActions {
    // biome-ignore lint/style/noParameterProperties: SDK client pattern
    constructor(private readonly client: Client) {
        this.client = client;
    }

    async list(): Promise<RunnerDTO[]> {
        const { data } = await this.client.request<Response<RunnerDTO[]>>({
            url: "/runners",
            method: "GET",
        });

        return data.data;
    }

    async createRegistration(): Promise<RunnerRegistrationDTO> {
        const { data } = await this.client.request<
            Response<RunnerRegistrationDTO>
        >({
            url: "/runners/registrations",
            method: "POST",
        });

        return data.data;
    }

    async revoke(id: string): Promise<void> {
        await this.client.request({
            url: `/runners/${encodeURIComponent(id)}`,
            method: "DELETE",
        });
    }
}
