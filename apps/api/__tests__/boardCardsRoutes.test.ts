import { parseBoardConfig } from "@repo/kanban-contract";
import type { CardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GithubClient } from "@/(shared)/lib/github/github-client";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import {
    createFakeBoardMemberRepository,
    type FakeBoardMemberRepository,
} from "./fakeBoardMemberRepository";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    getGithubClientMock,
    findBoardMock,
    recordBacklogSyncMock,
    memberStore,
    cardStore,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    findBoardMock: vi.fn(),
    recordBacklogSyncMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
    cardStore: { current: null as FakeCardRepository | null },
}));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
    },
}));

// Not `importActual`: the real module reads `@/env`, which validates every variable.
vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
        recordBacklogSync: (...args: unknown[]) =>
            recordBacklogSyncMock(...args),
    },
}));

const proxyTo = (store: { current: { repository: object } | null }) =>
    new Proxy(
        {},
        {
            get: (_target, property: string) =>
                (store.current?.repository as Record<string, unknown>)[
                    property
                ],
        }
    );

vi.mock("@/(shared)/repositories/board-member.repository", () => ({
    boardMemberRepository: proxyTo(memberStore),
}));

vi.mock("@/(shared)/repositories/card.repository", () => ({
    cardRepository: proxyTo(cardStore),
}));

// The board reads apply timeouts first; that is the orchestrator's, covered on its own.
vi.mock("@/(shared)/lib/orchestrator/tick-safely", () => ({
    tickSafely: () => Promise.resolve(),
}));

const { GET: LIST } = await import("@/app/(routes)/boards/[id]/cards/route");
const { POST: SYNC } = await import(
    "@/app/(routes)/boards/[id]/cards/sync/route"
);
const { PUT: REORDER } = await import(
    "@/app/(routes)/boards/[id]/cards/order/route"
);
const { GET: DETAIL } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/route"
);
const { POST: MOVE } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/move/route"
);
const { GET: SPEC } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/spec/route"
);

const BOARD_ID = "agent-board-demo--sample-app";
/** Specs with a valid frontmatter in the sample backlog, ready or not. */
const SAMPLE_SPEC_COUNT = 5;
const VALID_CONFIG = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;
const boardWith = (config: unknown = VALID_CONFIG) => ({
    id: BOARD_ID,
    ownerUserId: "p-owner",
    ownerGithubId: "1",
    name: "sample-app",
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
    config,
    configSource: {
        path: ".kanban/board.yml",
        ref: "main",
        sha: "x",
        readAt: "",
    },
    backlogSync: null,
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    deletedAt: null,
});

// GitHub permissions come from the emulator client: octo is admin, qa-writer write,
// qa-reader read.
const PEOPLE = {
    owner: { id: "p-owner", githubId: "1", login: "octo" },
    operator: { id: "p-operator", githubId: "3", login: "qa-writer" },
    reader: { id: "p-reader", githubId: "4", login: "qa-reader" },
    stranger: { id: "p-stranger", githubId: "5", login: "newcomer" },
} as const;
type Person = keyof typeof PEOPLE;

const profileOf = (person: Person) => {
    const { id, githubId, login } = PEOPLE[person];
    return {
        id,
        reference_id: `uid-${person}`,
        github: { id: githubId, login, name: null, avatarUrl: null },
    };
};

function request(
    as: Person,
    { method = "GET", body }: { method?: string; body?: unknown } = {}
): NextRequest {
    return {
        method,
        url: `http://localhost:3002/boards/${BOARD_ID}/cards`,
        headers: new Headers({
            "x-test-actor": `uid-${as}`,
            "content-type": "application/json",
        }),
        json: () => Promise.resolve(body ?? {}),
        text: () => Promise.resolve(JSON.stringify(body ?? {})),
    } as unknown as NextRequest;
}

const boardContext = { params: { id: BOARD_ID } };
const cardContext = (slug: string) => ({ params: { id: BOARD_ID, slug } });

async function errorCode(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } };
    return body.error.code;
}

async function dataOf<T>(response: Response): Promise<T> {
    const body = (await response.json()) as { data: T };
    return body.data;
}

let members: FakeBoardMemberRepository;
let cards: FakeCardRepository;
let client: GithubClient;

const sync = (as: Person = "owner") =>
    SYNC(request(as, { method: "POST" }), boardContext);
const move = (slug: string, body: unknown, as: Person = "owner") =>
    MOVE(request(as, { method: "POST", body }), cardContext(slug));
const reorder = (slugs: string[], as: Person = "owner") =>
    REORDER(request(as, { method: "PUT", body: { slugs } }), boardContext);
const storedCard = (slug: string) =>
    cards.documents.get(`${BOARD_ID}__${slug}`) as Record<string, unknown>;

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        getGithubClientMock,
        findBoardMock,
        recordBacklogSyncMock,
    ]) {
        mock.mockReset();
    }
    client = createGithubFakeClient(createGithubPermissionCache());
    getGithubClientMock.mockImplementation(() => client);
    findBoardMock.mockResolvedValue(boardWith());
    recordBacklogSyncMock.mockImplementation(
        (_id: string, meta: { syncedAt: Date }) =>
            Promise.resolve({ ...meta, syncedAt: meta.syncedAt.toISOString() })
    );
    resolveApiActorMock.mockImplementation((req: NextRequest) =>
        Promise.resolve({ uid: req.headers.get("x-test-actor") })
    );
    findByReferenceIdMock.mockImplementation((uid: string) =>
        Promise.resolve(profileOf(uid.replace("uid-", "") as Person))
    );

    members = createFakeBoardMemberRepository();
    memberStore.current = members;
    members.seedOwner(
        BOARD_ID,
        {
            userId: PEOPLE.owner.id,
            github: { id: "1", login: "octo", name: null, avatarUrl: null },
        },
        new Date("2026-11-25T10:00:00.000Z")
    );
    for (const person of ["operator", "reader"] as const) {
        const { id, githubId, login } = PEOPLE[person];
        members.seedInvite(BOARD_ID, login, "operator", {
            status: "active",
            githubId,
            userId: id,
        });
    }

    cards = createFakeCardRepository();
    cardStore.current = cards;
});

describe("POST /boards/[id]/cards/sync", () => {
    it("turns the sample backlog into cards, ready ones in index order", async () => {
        const response = await sync();
        const data = await dataOf<{
            created: number;
            skipped: { path: string; reason: string }[];
            cards: CardDTO[];
            backlogSync: { indexPath: string; specCount: number };
        }>(response);

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(data.created).toBe(SAMPLE_SPEC_COUNT);
        const ready = data.cards.filter(
            (card) => card.lane === "tasks" && card.ready
        );
        expect(ready.map((card) => card.slug)).toEqual([
            "search-cards",
            "keyboard-shortcuts",
            "dark-theme",
        ]);
        expect(
            data.cards
                .filter((card) => !card.ready)
                .map((card) => [card.slug, card.spec.status])
        ).toEqual([
            ["slack-alerts", "proposed"],
            ["fork-cleanup", "done"],
        ]);
        expect(data.skipped).toEqual([
            { path: "specs/features/legacy-export.md", reason: "not_found" },
            {
                path: "specs/features/broken-frontmatter.md",
                reason: "frontmatter_invalid",
            },
        ]);
        expect(data.cards[0]).toMatchObject({
            title: "Busca por texto nos cards",
            branch: "feat/search-cards",
            state: "idle",
        });
        expect(
            data.cards.find((card) => card.slug === "keyboard-shortcuts")?.title
        ).toBe("Atalhos de teclado no quadro");
        expect(data.backlogSync).toMatchObject({
            indexPath: "specs/BACKLOG.md",
            specCount: 5,
        });
        expect(recordBacklogSyncMock).toHaveBeenCalledWith(
            BOARD_ID,
            expect.objectContaining({ ref: "main", specCount: 5 })
        );
    });

    it("keeps the board's order on a second sync", async () => {
        await sync();
        await reorder(["dark-theme", "search-cards", "keyboard-shortcuts"]);

        const data = await dataOf<{ cards: CardDTO[]; unchanged: number }>(
            await sync()
        );

        expect(
            data.cards
                .filter((card) => card.lane === "tasks" && card.ready)
                .map((card) => card.slug)
        ).toEqual(["dark-theme", "search-cards", "keyboard-shortcuts"]);
        expect(data.unchanged).toBe(SAMPLE_SPEC_COUNT);
    });

    it("keeps a card whose spec is gone, as an orphan", async () => {
        cards.seed(BOARD_ID, "removed-spec", {
            lane: "stage",
            stageKey: "analyze",
        });

        const data = await dataOf<{ cards: CardDTO[]; orphaned: number }>(
            await sync()
        );

        expect(data.orphaned).toBe(1);
        expect(
            data.cards.find((card) => card.slug === "removed-spec")
        ).toMatchObject({ orphan: true, ready: false, lane: "stage" });
    });

    it("lets an operator sync and refuses an operator capped to viewer by GitHub", async () => {
        expect((await sync("operator")).status).toBe(HTTP_STATUS.OK);

        const response = await sync("reader");
        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
    });

    it("hides the board from someone who is not a member", async () => {
        const response = await sync("stranger");

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_NOT_FOUND");
    });

    it("refuses a board whose backlog is manual", async () => {
        findBoardMock.mockResolvedValue(
            boardWith({
                ...VALID_CONFIG,
                backlog: { ...VALID_CONFIG?.backlog, source: "manual" },
            })
        );

        const response = await sync();

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("BOARD_BACKLOG_SOURCE_MANUAL");
    });

    it("answers BOARD_BACKLOG_INDEX_NOT_FOUND when the index is missing", async () => {
        findBoardMock.mockResolvedValue(
            boardWith({
                ...VALID_CONFIG,
                backlog: { ...VALID_CONFIG?.backlog, index: "docs/NOPE.md" },
            })
        );

        const response = await sync();

        expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect(await errorCode(response)).toBe("BOARD_BACKLOG_INDEX_NOT_FOUND");
        expect(recordBacklogSyncMock).not.toHaveBeenCalled();
    });
});

describe("GET /boards/[id]/cards and /cards/[slug]", () => {
    it("lets a viewer read the cards", async () => {
        await sync();

        const listed = await LIST(request("reader"), boardContext);
        const detail = await DETAIL(
            request("reader"),
            cardContext("dark-theme")
        );

        expect(listed.status).toBe(HTTP_STATUS.OK);
        expect(await dataOf<CardDTO[]>(listed)).toHaveLength(SAMPLE_SPEC_COUNT);
        expect(await dataOf<CardDTO>(detail)).toMatchObject({
            slug: "dark-theme",
        });
    });

    it("answers CARD_NOT_FOUND for a slug without a card", async () => {
        const response = await DETAIL(request("owner"), cardContext("nope"));

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("CARD_NOT_FOUND");
    });
});

describe("PUT /boards/[id]/cards/order", () => {
    beforeEach(async () => {
        await sync();
    });

    it("writes the new order of Tasks", async () => {
        const response = await reorder([
            "dark-theme",
            "search-cards",
            "keyboard-shortcuts",
        ]);

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(storedCard("dark-theme").order).toBe(0);
        expect(storedCard("keyboard-shortcuts").order).toBe(2);
    });

    it("answers CARD_ORDER_STALE when the list is not the current queue", async () => {
        for (const slugs of [
            ["dark-theme", "search-cards"],
            ["dark-theme", "search-cards", "slack-alerts"],
        ]) {
            const response = await reorder(slugs);

            expect(response.status).toBe(HTTP_STATUS.CONFLICT);
            expect(await errorCode(response)).toBe("CARD_ORDER_STALE");
        }
    });

    it("refuses a repeated slug as a validation failure", async () => {
        const response = await reorder(["dark-theme", "dark-theme"]);

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    });

    it("refuses a viewer", async () => {
        const response = await reorder(
            ["dark-theme", "search-cards", "keyboard-shortcuts"],
            "reader"
        );

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
    });
});

describe("POST /boards/[id]/cards/[slug]/move", () => {
    beforeEach(async () => {
        await sync();
    });

    it("refuses to move a card into a stage column: entering a stage triggers it", async () => {
        const response = await move("search-cards", {
            lane: "stage",
            stageKey: "analyze",
        });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
        expect(storedCard("search-cards")).toMatchObject({
            lane: "tasks",
            stageKey: null,
            state: "idle",
        });
    });

    it("takes a stage card back to Tasks idle, recording who moved it", async () => {
        cards.seed(BOARD_ID, "failed-card", {
            lane: "stage",
            stageKey: "develop",
            state: "failed",
        });

        const response = await move("failed-card", { lane: "tasks" });

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(await dataOf<CardDTO>(response)).toMatchObject({
            lane: "tasks",
            stageKey: null,
            state: "idle",
        });
        expect(storedCard("failed-card")).toMatchObject({
            movedByUserId: PEOPLE.owner.id,
        });
    });

    it("answers CARD_RUN_ACTIVE for a card with a live run and leaves it in its stage", async () => {
        cards.seed(BOARD_ID, "running-card", {
            lane: "stage",
            stageKey: "analyze",
            state: "running",
            activeRunId: "run-1",
        });

        const response = await move("running-card", { lane: "done" });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CARD_RUN_ACTIVE");
        expect(storedCard("running-card")).toMatchObject({
            lane: "stage",
            stageKey: "analyze",
            state: "running",
        });
    });

    it("puts a card coming back to Tasks at the end of the queue", async () => {
        await move("search-cards", { lane: "done" });

        const response = await move("search-cards", { lane: "tasks" });

        expect(await dataOf<CardDTO>(response)).toMatchObject({
            lane: "tasks",
            stageKey: null,
            order: 5,
        });
    });

    it("answers CARD_NOT_READY for a card that is not ready", async () => {
        const response = await move("slack-alerts", { lane: "done" });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CARD_NOT_READY");
        expect(storedCard("slack-alerts").lane).toBe("tasks");
    });

    it("answers CARD_NOT_FOUND for a slug without a card", async () => {
        const response = await move("nope", { lane: "done" });

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("CARD_NOT_FOUND");
    });

    it("refuses a body without a valid lane", async () => {
        const response = await move("search-cards", { lane: "stage" });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it("refuses a viewer and leaves the card where it was", async () => {
        const response = await move("search-cards", { lane: "done" }, "reader");

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
        expect(storedCard("search-cards").lane).toBe("tasks");
    });
});

describe("GET /boards/[id]/cards/[slug]/spec", () => {
    beforeEach(async () => {
        await sync();
    });

    it("returns the spec as it is on the base branch", async () => {
        const response = await SPEC(
            request("reader"),
            cardContext("search-cards")
        );
        const data = await dataOf<{
            path: string;
            ref: string;
            content: string;
        }>(response);

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(data).toMatchObject({
            path: "specs/features/search-cards.md",
            ref: "main",
        });
        expect(data.content).toContain("# Busca por texto nos cards");
    });

    it("leaves the frontmatter out of the content", async () => {
        const response = await SPEC(
            request("reader"),
            cardContext("search-cards")
        );
        const data = await dataOf<{ content: string }>(response);

        expect(data.content).not.toContain("id: search-cards");
        expect(data.content.trimStart().startsWith("---")).toBe(false);
    });

    it("answers content null when the file is gone", async () => {
        client = { ...client, readFile: () => Promise.resolve(null) };

        const response = await SPEC(
            request("owner"),
            cardContext("search-cards")
        );

        expect(await dataOf(response)).toMatchObject({
            content: null,
            sha: null,
        });
    });

    it("answers CARD_NOT_FOUND for a slug without a card", async () => {
        const response = await SPEC(request("owner"), cardContext("nope"));

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("CARD_NOT_FOUND");
    });
});
