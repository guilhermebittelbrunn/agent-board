import { parseBoardConfig } from "@repo/kanban-contract";
import type { CardEventDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GithubClient } from "@/(shared)/lib/github/github-client";
import { GithubApiError } from "@/(shared)/lib/github/github-errors";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const { cardStore, getGithubClientMock, listEventsMock, appendMock, envMock } =
    vi.hoisted(() => ({
        cardStore: { current: null as FakeCardRepository | null },
        getGithubClientMock: vi.fn(),
        listEventsMock: vi.fn(),
        appendMock: vi.fn(),
        envMock: { NEXT_PUBLIC_APP_URL: undefined as string | undefined },
    }));

vi.mock("@/env", () => ({ env: envMock }));

vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: new Proxy(
        {},
        {
            get: (_target, property: string) =>
                (
                    cardStore.current?.repository as unknown as Record<
                        string,
                        unknown
                    >
                )[property],
        }
    ),
}));

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: {
        listByCard: (...args: unknown[]) => listEventsMock(...args),
        appendAgentEvent: (...args: unknown[]) => appendMock(...args),
    },
}));

const { buildPullRequestBody, ensurePullRequest } = await import(
    "@/(shared)/lib/pull-request/pull-request-open"
);

const BOARD_ID = "agent-board-demo--sample-app";
const config = (() => {
    const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
    if (!parsed.success) {
        throw new Error("sample config is invalid");
    }
    return parsed.data;
})();
const board = {
    id: BOARD_ID,
    config,
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
};
const OCTO = { userId: "p-owner", login: "octo" };
const NOW = new Date("2026-11-27T10:00:00.000Z");
const GITHUB_BODY_LIMIT = 65_536;
const BOARD_BODY_LIMIT = 60_000;

let cards: FakeCardRepository;
let client: GithubClient;

const seedOnPrStage = (slug: string, extra: Record<string, unknown> = {}) =>
    cards.seed(BOARD_ID, slug, {
        lane: "stage",
        stageKey: "pr",
        state: "queued",
        title: "Busca",
        branch: `feat/${slug}`,
        ...extra,
    });

const report = (stageKey: string, markdown: string): CardEventDTO =>
    ({
        id: `e-${stageKey}-${markdown}`,
        type: "report",
        stageKey,
        markdown,
        outcome: "success",
        createdAt: NOW.toISOString(),
    }) as unknown as CardEventDTO;

const open = (cardId: string) =>
    ensurePullRequest({ board, cardId, dispatchAs: OCTO, now: NOW });

beforeEach(() => {
    cards = createFakeCardRepository();
    cardStore.current = cards;
    client = createGithubFakeClient(createGithubPermissionCache());
    getGithubClientMock.mockReset();
    getGithubClientMock.mockImplementation(() => client);
    listEventsMock.mockReset();
    listEventsMock.mockResolvedValue([]);
    appendMock.mockReset();
    appendMock.mockResolvedValue({ ok: true });
    envMock.NEXT_PUBLIC_APP_URL = undefined;
});

describe("ensurePullRequest", () => {
    it("opens a draft and stores it on the card with who runs the comments", async () => {
        const id = seedOnPrStage("search-cards");

        const result = await open(id);

        expect(result.ok).toBe(true);
        const card = await cards.repository.findById(id);
        expect(card?.pullRequest).toMatchObject({
            state: "open",
            draft: true,
            title: "Busca",
            headRef: "feat/search-cards",
            baseRef: "main",
            openedByBoard: true,
            openedAt: NOW.toISOString(),
            dispatchAs: OCTO,
        });
        expect(card?.pullRequestError).toBeNull();
        expect(appendMock).toHaveBeenCalledWith(
            expect.objectContaining({ id }),
            expect.objectContaining({
                type: "update",
                markdown: expect.stringContaining("aberta como rascunho"),
            })
        );
    });

    it("links the card in the pull request body when the app URL is known", async () => {
        envMock.NEXT_PUBLIC_APP_URL = "https://board.test/";
        const id = seedOnPrStage("search-cards");
        const create = vi.spyOn(client, "createPullRequest");

        await open(id);

        expect(create.mock.calls[0][1].body).toContain(
            `Card: https://board.test/boards/${BOARD_ID}/cards/search-cards`
        );
    });

    it("returns the card as it is when its pull request is already open", async () => {
        const id = seedOnPrStage("search-cards");
        await open(id);
        const create = vi.spyOn(client, "createPullRequest");

        const again = await open(id);

        expect(again.ok).toBe(true);
        expect(create).not.toHaveBeenCalled();
    });

    it("adopts the open pull request of the branch on a 422", async () => {
        const id = seedOnPrStage("search-cards");
        vi.spyOn(client, "createPullRequest").mockRejectedValue(
            new GithubApiError(
                "unprocessable",
                HTTP_STATUS.UNPROCESSABLE_ENTITY
            )
        );

        await open(id);

        const card = await cards.repository.findById(id);
        expect(card?.pullRequest?.openedByBoard).toBe(false);
        expect(appendMock.mock.calls[0][1].markdown).toContain("adotada");
    });

    it("opens ready for review when GitHub refuses the draft", async () => {
        const id = seedOnPrStage("search-cards");
        const create = vi.spyOn(client, "createPullRequest");
        create.mockRejectedValueOnce(
            new GithubApiError(
                "unprocessable",
                HTTP_STATUS.UNPROCESSABLE_ENTITY
            )
        );
        vi.spyOn(client, "findOpenPullRequest").mockResolvedValue(null);

        await open(id);

        expect(create).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ draft: false })
        );
        expect(appendMock.mock.calls[0][1].markdown).toContain(
            "pronta para review"
        );
    });

    it.each([
        [
            "feat/qa-pr-permission",
            "GITHUB_APP_PERMISSION_MISSING",
            HTTP_STATUS.SERVICE_UNAVAILABLE,
        ],
        [
            "feat/qa-pr-rejected",
            "GITHUB_PULL_REQUEST_REJECTED",
            HTTP_STATUS.UNPROCESSABLE_ENTITY,
        ],
    ])(
        "writes the failure of %s on the card instead of throwing",
        async (branch, code, status) => {
            const id = seedOnPrStage("search-cards", { branch });

            const result = await open(id);

            expect(result).toEqual({ ok: false, code, status });
            const card = await cards.repository.findById(id);
            expect(card?.pullRequest).toBeNull();
            expect(card?.pullRequestError).toEqual({
                code,
                at: NOW.toISOString(),
            });
        }
    );

    it("drops a pull request closed on an earlier pass when opening again fails", async () => {
        const id = seedOnPrStage("search-cards", {
            branch: "feat/qa-pr-rejected",
            pullRequest: { number: 7, state: "closed", openedAt: NOW },
        });

        await open(id);

        const card = await cards.repository.findById(id);
        expect(card?.pullRequest).toBeNull();
        expect(card?.pullRequestError?.code).toBe(
            "GITHUB_PULL_REQUEST_REJECTED"
        );
    });

    it("writes GITHUB_APP_NOT_CONFIGURED without a GitHub App", async () => {
        const id = seedOnPrStage("search-cards");
        getGithubClientMock.mockReturnValue(null);

        const result = await open(id);

        expect(result).toMatchObject({
            ok: false,
            code: "GITHUB_APP_NOT_CONFIGURED",
        });
        expect(
            (await cards.repository.findById(id))?.pullRequestError?.code
        ).toBe("GITHUB_APP_NOT_CONFIGURED");
    });

    it("refuses a card off the pull request stage and touches nothing", async () => {
        const id = cards.seed(BOARD_ID, "search-cards", {
            lane: "stage",
            stageKey: "test",
        });

        const result = await open(id);

        expect(result).toMatchObject({
            ok: false,
            code: "CARD_NOT_IN_PULL_REQUEST_STAGE",
            status: HTTP_STATUS.CONFLICT,
        });
        expect(appendMock).not.toHaveBeenCalled();
    });

    it("clears the earlier failure once the pull request opens", async () => {
        const id = seedOnPrStage("search-cards", {
            pullRequestError: { code: "GITHUB_UNAVAILABLE", at: NOW },
        });

        await open(id);

        expect(
            (await cards.repository.findById(id))?.pullRequestError
        ).toBeNull();
    });
});

describe("buildPullRequestBody", () => {
    it("puts the last report of each earlier stage in the board's order, with the card link", () => {
        const body = buildPullRequestBody({
            config,
            stageKey: "pr",
            events: [
                report("develop", "dev 1"),
                report("analyze", "plan"),
                report("develop", "dev 2"),
                report("pr", "ignored"),
            ],
            cardUrl: "https://board.test/boards/b/cards/x",
        });

        expect(body).toBe(
            "## Análise\n\nplan\n\n## Executando\n\ndev 2\n\n---\n\nCard: https://board.test/boards/b/cards/x"
        );
    });

    it("stays under GitHub's body limit", () => {
        const body = buildPullRequestBody({
            config,
            stageKey: "pr",
            events: [report("analyze", "x".repeat(GITHUB_BODY_LIMIT))],
            cardUrl: null,
        });

        expect(body.length).toBeLessThanOrEqual(BOARD_BODY_LIMIT);
        expect(body.endsWith("…")).toBe(true);
    });
});
