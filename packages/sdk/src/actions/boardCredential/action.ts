import type { Client } from "../../client/index";
import type { Response } from "../../client/type";
import type {
    BoardCredentialsDTO,
    SaveScheduledTaskRequest,
    ScheduledTaskCredentialDTO,
} from "../../types";

const credentialsPath = (boardId: string) =>
    `/boards/${encodeURIComponent(boardId)}/credentials`;

const scheduledTaskPath = (boardId: string, stageKey: string) =>
    `${credentialsPath(boardId)}/scheduled-tasks/${encodeURIComponent(stageKey)}`;

export default class BoardCredentialActions {
    // biome-ignore lint/style/noParameterProperties: SDK client pattern
    constructor(private readonly client: Client) {
        this.client = client;
    }

    async list(boardId: string): Promise<BoardCredentialsDTO> {
        const { data } = await this.client.request<
            Response<BoardCredentialsDTO>
        >({
            url: credentialsPath(boardId),
            method: "GET",
        });

        return data.data;
    }

    async saveScheduledTask(
        boardId: string,
        stageKey: string,
        body: SaveScheduledTaskRequest
    ): Promise<ScheduledTaskCredentialDTO> {
        const { data } = await this.client.request<
            Response<ScheduledTaskCredentialDTO>
        >({
            url: scheduledTaskPath(boardId, stageKey),
            method: "PUT",
            data: body,
        });

        return data.data;
    }

    async removeScheduledTask(
        boardId: string,
        stageKey: string
    ): Promise<void> {
        await this.client.request({
            url: scheduledTaskPath(boardId, stageKey),
            method: "DELETE",
        });
    }
}
