import type { Client } from "../../client/index";
import type { Response } from "../../client/type";
import type {
    BoardMemberDTO,
    InviteBoardMemberRequest,
    UpdateBoardMemberRequest,
} from "../../types";

const membersPath = (boardId: string) =>
    `/boards/${encodeURIComponent(boardId)}/members`;

const memberPath = (boardId: string, memberId: string) =>
    `${membersPath(boardId)}/${encodeURIComponent(memberId)}`;

export default class BoardMemberActions {
    // biome-ignore lint/style/noParameterProperties: SDK client pattern
    constructor(private readonly client: Client) {
        this.client = client;
    }

    async list(boardId: string): Promise<BoardMemberDTO[]> {
        const { data } = await this.client.request<Response<BoardMemberDTO[]>>({
            url: membersPath(boardId),
            method: "GET",
        });

        return data.data;
    }

    async invite(
        boardId: string,
        body: InviteBoardMemberRequest
    ): Promise<BoardMemberDTO> {
        const { data } = await this.client.request<Response<BoardMemberDTO>>({
            url: membersPath(boardId),
            method: "POST",
            data: body,
        });

        return data.data;
    }

    async updateRole(
        boardId: string,
        memberId: string,
        body: UpdateBoardMemberRequest
    ): Promise<BoardMemberDTO> {
        const { data } = await this.client.request<Response<BoardMemberDTO>>({
            url: memberPath(boardId, memberId),
            method: "PATCH",
            data: body,
        });

        return data.data;
    }

    async remove(boardId: string, memberId: string): Promise<void> {
        await this.client.request({
            url: memberPath(boardId, memberId),
            method: "DELETE",
        });
    }
}
