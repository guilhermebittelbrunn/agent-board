import type { Client } from "../../client/index";
import type { Response } from "../../client/type";
import type {
    AnswerQuestionsRequest,
    AnswerQuestionsResultDTO,
    CardCommentRequest,
    CardDTO,
    CardEventViewDTO,
    CardSpecContentDTO,
    CardSyncResultDTO,
    MoveCardRequest,
    ReorderCardsRequest,
    TriggerStageRequest,
    TriggerStageResultDTO,
} from "../../types";

const cardsPath = (boardId: string) =>
    `/boards/${encodeURIComponent(boardId)}/cards`;

const cardPath = (boardId: string, slug: string) =>
    `${cardsPath(boardId)}/${encodeURIComponent(slug)}`;

export default class BoardCardActions {
    // biome-ignore lint/style/noParameterProperties: SDK client pattern
    constructor(private readonly client: Client) {
        this.client = client;
    }

    async list(boardId: string): Promise<CardDTO[]> {
        const { data } = await this.client.request<Response<CardDTO[]>>({
            url: cardsPath(boardId),
            method: "GET",
        });

        return data.data;
    }

    async findBySlug(boardId: string, slug: string): Promise<CardDTO> {
        const { data } = await this.client.request<Response<CardDTO>>({
            url: cardPath(boardId, slug),
            method: "GET",
        });

        return data.data;
    }

    async findSpec(boardId: string, slug: string): Promise<CardSpecContentDTO> {
        const { data } = await this.client.request<
            Response<CardSpecContentDTO>
        >({
            url: `${cardPath(boardId, slug)}/spec`,
            method: "GET",
        });

        return data.data;
    }

    async sync(boardId: string): Promise<CardSyncResultDTO> {
        const { data } = await this.client.request<Response<CardSyncResultDTO>>(
            {
                url: `${cardsPath(boardId)}/sync`,
                method: "POST",
            }
        );

        return data.data;
    }

    async reorder(
        boardId: string,
        body: ReorderCardsRequest
    ): Promise<CardDTO[]> {
        const { data } = await this.client.request<Response<CardDTO[]>>({
            url: `${cardsPath(boardId)}/order`,
            method: "PUT",
            data: body,
        });

        return data.data;
    }

    async move(
        boardId: string,
        slug: string,
        body: MoveCardRequest
    ): Promise<CardDTO> {
        const { data } = await this.client.request<Response<CardDTO>>({
            url: `${cardPath(boardId, slug)}/move`,
            method: "POST",
            data: body,
        });

        return data.data;
    }

    async listEvents(
        boardId: string,
        slug: string
    ): Promise<CardEventViewDTO[]> {
        const { data } = await this.client.request<
            Response<CardEventViewDTO[]>
        >({
            url: `${cardPath(boardId, slug)}/events`,
            method: "GET",
        });

        return data.data;
    }

    async comment(
        boardId: string,
        slug: string,
        body: CardCommentRequest
    ): Promise<CardEventViewDTO> {
        const { data } = await this.client.request<Response<CardEventViewDTO>>({
            url: `${cardPath(boardId, slug)}/comments`,
            method: "POST",
            data: body,
        });

        return data.data;
    }

    async editComment(
        boardId: string,
        slug: string,
        eventId: string,
        body: CardCommentRequest
    ): Promise<CardEventViewDTO> {
        const { data } = await this.client.request<Response<CardEventViewDTO>>({
            url: `${cardPath(boardId, slug)}/events/${encodeURIComponent(eventId)}`,
            method: "PATCH",
            data: body,
        });

        return data.data;
    }

    async deleteComment(
        boardId: string,
        slug: string,
        eventId: string
    ): Promise<void> {
        await this.client.request({
            url: `${cardPath(boardId, slug)}/events/${encodeURIComponent(eventId)}`,
            method: "DELETE",
        });
    }

    async answer(
        boardId: string,
        slug: string,
        body: AnswerQuestionsRequest
    ): Promise<AnswerQuestionsResultDTO> {
        const { data } = await this.client.request<
            Response<AnswerQuestionsResultDTO>
        >({
            url: `${cardPath(boardId, slug)}/answers`,
            method: "POST",
            data: body,
        });

        return data.data;
    }

    async trigger(
        boardId: string,
        slug: string,
        body: TriggerStageRequest
    ): Promise<TriggerStageResultDTO> {
        const { data } = await this.client.request<
            Response<TriggerStageResultDTO>
        >({
            url: `${cardPath(boardId, slug)}/runs`,
            method: "POST",
            data: body,
        });

        return data.data;
    }

    async stop(boardId: string, slug: string): Promise<CardDTO> {
        const { data } = await this.client.request<Response<CardDTO>>({
            url: `${cardPath(boardId, slug)}/stop`,
            method: "POST",
        });

        return data.data;
    }

    /** Opens (or adopts) the pull request of a card on the pull request stage; idempotent. */
    async openPullRequest(boardId: string, slug: string): Promise<CardDTO> {
        const { data } = await this.client.request<Response<CardDTO>>({
            url: `${cardPath(boardId, slug)}/pull-request`,
            method: "POST",
        });

        return data.data;
    }

    async approveSpec(boardId: string, slug: string): Promise<CardDTO> {
        const { data } = await this.client.request<Response<CardDTO>>({
            url: `${cardPath(boardId, slug)}/spec/approve`,
            method: "POST",
        });

        return data.data;
    }

    async discardDraft(boardId: string, slug: string): Promise<void> {
        await this.client.request({
            url: `${cardPath(boardId, slug)}/spec/discard`,
            method: "POST",
        });
    }
}
