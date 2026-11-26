import { UserRoleLevel } from "@repo/auth/types";
import {
    MAX_ANSWER_TEXT,
    MAX_MARKDOWN,
    parseBoardConfig,
} from "@repo/kanban-contract";
import {
    type AnswerQuestionsResultDTO,
    type CardEventViewDTO,
    UserType,
} from "@repo/sdk/src/types";
import { AUTH_REQUEST_HEADER } from "@repo/shared/utils/helpers/auth-request-headers";
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
    createFakeCardEventRepository,
    type FakeCardEventRepository,
} from "./fakeCardEventRepository";
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
    eventStore,
    resumeAfterAnswerMock,
} = vi.hoisted(() => ({
    resumeAfterAnswerMock: vi.fn(),
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    findBoardMock: vi.fn(),
    recordBacklogSyncMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
    cardStore: { current: null as FakeCardRepository | null },
    eventStore: { current: null as FakeCardEventRepository | null },
}));

vi.mock("@/(shared)/lib/resolve-api-actor", () => ({
    resolveApiActor: (...args: unknown[]) => resolveApiActorMock(...args),
}));

vi.mock("@/(shared)/repositories/user.repository", () => ({
    userRepository: {
        findByReferenceId: (...args: unknown[]) =>
            findByReferenceIdMock(...args),
        touchLastAccess: vi.fn(),
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

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: proxyTo(eventStore),
}));

vi.mock("@/(shared)/lib/orchestrator/orchestrator", () => ({
    resumeAfterAnswer: (...args: unknown[]) => resumeAfterAnswerMock(...args),
}));

const { GET: LIST_EVENTS } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/events/route"
);
const { POST: COMMENT } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/comments/route"
);
const { PATCH: EDIT, DELETE: REMOVE } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/events/[eventId]/route"
);
const { POST: ANSWER } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/answers/route"
);

const BOARD_ID = "agent-board-demo--sample-app";
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
    admin: { id: "p-admin", githubId: "", login: "" },
} as const;
type Person = keyof typeof PEOPLE;

const profileOf = (person: Person) => {
    const { id, githubId, login } = PEOPLE[person];
    return {
        id,
        reference_id: `uid-${person}`,
        type: person === "admin" ? UserType.ADMIN : UserType.COMMON,
        github:
            person === "admin"
                ? null
                : { id: githubId, login, name: null, avatarUrl: null },
    };
};

function request(
    as: Person,
    {
        method = "GET",
        body,
        subject = as,
    }: { method?: string; body?: unknown; subject?: Person } = {}
): NextRequest {
    const impersonating = as === "admin";
    return {
        method,
        url: `http://localhost:3002/boards/${BOARD_ID}/cards`,
        headers: new Headers({
            [AUTH_REQUEST_HEADER.USER_ID]: `uid-${as}`,
            [AUTH_REQUEST_HEADER.USER_ROLE]: impersonating
                ? UserRoleLevel.ADMIN
                : UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_ROLE]: UserRoleLevel.COMMON,
            [AUTH_REQUEST_HEADER.REQUEST_USER_ID]: `uid-${subject}`,
            "content-type": "application/json",
        }),
        json: () => Promise.resolve(body ?? {}),
        text: () => Promise.resolve(JSON.stringify(body ?? {})),
    } as unknown as NextRequest;
}

const SLUG = "search-cards";
const NO_CONTENT = 204;
const CARD_ID = `${BOARD_ID}__${SLUG}`;
const ctxOf = (slug = SLUG) => ({ params: { id: BOARD_ID, slug } });
const eventCtx = (eventId: string, slug = SLUG) => ({
    params: { id: BOARD_ID, slug, eventId },
});

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
let events: FakeCardEventRepository;
let client: GithubClient;
let questionId: string;

const listEvents = (as: Person = "owner", slug = SLUG) =>
    LIST_EVENTS(request(as), ctxOf(slug));
const comment = (markdown: string, as: Person = "owner") =>
    COMMENT(request(as, { method: "POST", body: { markdown } }), ctxOf());
const edit = (eventId: string, markdown: string, as: Person = "owner") =>
    EDIT(
        request(as, { method: "PATCH", body: { markdown } }),
        eventCtx(eventId)
    );
const remove = (eventId: string, as: Person = "owner", slug = SLUG) =>
    REMOVE(request(as, { method: "DELETE" }), eventCtx(eventId, slug));
const answer = (body: unknown, as: Person = "owner") =>
    ANSWER(request(as, { method: "POST", body }), ctxOf());

const QUESTIONS = [
    {
        question: "A busca considera o corpo da spec?",
        header: "Escopo",
        options: [{ label: "Só o título" }, { label: "Título e corpo" }],
        recommended: 0,
    },
    {
        question: "Qual atalho abre a busca?",
        header: "Atalho",
        options: [{ label: "Ctrl+K" }, { label: "/" }],
    },
];
const VALID_ANSWERS = [
    { kind: "option", option: 1 },
    { kind: "text", text: "Usar o atalho /" },
];
const stageEvent = {
    boardId: BOARD_ID,
    cardId: CARD_ID,
    stageKey: "analyze",
    lane: "stage" as const,
    author: { kind: "agent" as const, name: "planejador-tarefa" },
};
const cardPosition = () => {
    const stored = cards.documents.get(CARD_ID) as Record<string, unknown>;
    return {
        lane: stored.lane,
        stageKey: stored.stageKey,
        state: stored.state,
    };
};

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        getGithubClientMock,
        findBoardMock,
        recordBacklogSyncMock,
        resumeAfterAnswerMock,
    ]) {
        mock.mockReset();
    }
    resumeAfterAnswerMock.mockResolvedValue(undefined);
    client = createGithubFakeClient(createGithubPermissionCache());
    getGithubClientMock.mockImplementation(() => client);
    findBoardMock.mockResolvedValue(boardWith());
    resolveApiActorMock.mockImplementation((req: NextRequest) =>
        Promise.resolve({ uid: req.headers.get(AUTH_REQUEST_HEADER.USER_ID) })
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
    cards.seed(BOARD_ID, SLUG, { lane: "stage", stageKey: "analyze" });
    events = createFakeCardEventRepository(cards);
    eventStore.current = events;
    events.seed({
        ...stageEvent,
        type: "update",
        markdown: "Lendo a spec.",
    });
    questionId = events.seed({
        ...stageEvent,
        type: "question",
        questions: QUESTIONS,
    });
});

describe("GET /boards/[id]/cards/[slug]/events", () => {
    it("lists the card's events oldest first, to every member", async () => {
        for (const person of ["owner", "operator", "reader"] as const) {
            const response = await listEvents(person);
            const data = await dataOf<CardEventViewDTO[]>(response);

            expect(response.status).toBe(HTTP_STATUS.OK);
            expect(data.map((event) => event.type)).toEqual([
                "update",
                "question",
            ]);
        }
    });

    it("answers 404 to someone who is not a member", async () => {
        const response = await listEvents("stranger");

        expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
        expect(await errorCode(response)).toBe("BOARD_NOT_FOUND");
    });

    it("answers 404 for a card that does not exist", async () => {
        const response = await listEvents("owner", "missing-card");

        expect(await errorCode(response)).toBe("CARD_NOT_FOUND");
    });
});

describe("POST /boards/[id]/cards/[slug]/comments", () => {
    it("lets a viewer comment, under the card's current stage", async () => {
        const response = await comment(
            "  Olhem o caso de busca vazia.  ",
            "reader"
        );
        const data = await dataOf<CardEventViewDTO>(response);

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(data).toMatchObject({
            type: "comment",
            markdown: "Olhem o caso de busca vazia.",
            stageKey: "analyze",
            lane: "stage",
            author: { kind: "person", userId: "p-reader", login: "qa-reader" },
            isOwn: true,
        });
    });

    it("refuses an empty comment and one above the size limit", async () => {
        for (const markdown of ["   ", "x".repeat(MAX_MARKDOWN + 1)]) {
            const response = await comment(markdown);

            expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
            expect(await errorCode(response)).toBe("VALIDATION_FAILED");
        }
    });

    it("refuses an admin impersonating a member", async () => {
        const response = await COMMENT(
            request("admin", {
                method: "POST",
                body: { markdown: "oi" },
                subject: "owner",
            }),
            ctxOf()
        );

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
});

describe("PATCH and DELETE /boards/[id]/cards/[slug]/events/[eventId]", () => {
    it("lets the author edit and delete their comment", async () => {
        const created = await dataOf<CardEventViewDTO>(
            await comment("primeira versão")
        );

        const edited = await dataOf<CardEventViewDTO>(
            await edit(created.id, "segunda versão")
        );
        expect(edited).toMatchObject({
            type: "comment",
            markdown: "segunda versão",
        });
        expect(edited.type === "comment" && edited.editedAt).toBeTruthy();

        const removed = await remove(created.id);
        expect(removed.status).toBe(NO_CONTENT);
        const left = await dataOf<CardEventViewDTO[]>(await listEvents());
        expect(left.some((event) => event.id === created.id)).toBe(false);
    });

    it("refuses someone else's comment, even to the owner", async () => {
        const created = await dataOf<CardEventViewDTO>(
            await comment("comentário do operador", "operator")
        );

        const editResponse = await edit(created.id, "trocado", "owner");
        expect(editResponse.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(editResponse)).toBe("CARD_EVENT_NOT_EDITABLE");

        const removeResponse = await remove(created.id, "owner");
        expect(await errorCode(removeResponse)).toBe("CARD_EVENT_NOT_EDITABLE");
        expect(events.documents.get(created.id)?.deletedAt).toBeNull();
    });

    it("never edits or deletes an agent event", async () => {
        const response = await remove(questionId);

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("CARD_EVENT_NOT_EDITABLE");
    });

    it("answers 404 for an event of another card or board", async () => {
        cards.seed(BOARD_ID, "dark-theme", {
            lane: "stage",
            stageKey: "analyze",
        });
        const otherCardComment = events.seed({
            ...stageEvent,
            cardId: `${BOARD_ID}__dark-theme`,
            type: "comment",
            markdown: "outro card",
            author: { kind: "person", userId: "p-owner", login: "octo" },
        });
        const otherBoardComment = events.seed({
            ...stageEvent,
            boardId: "someone--else",
            cardId: `someone--else__${SLUG}`,
            type: "comment",
            markdown: "outro board",
            author: { kind: "person", userId: "p-owner", login: "octo" },
        });

        for (const eventId of [otherCardComment, otherBoardComment]) {
            const response = await edit(eventId, "invadido");

            expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
            expect(await errorCode(response)).toBe("CARD_EVENT_NOT_FOUND");
        }
        expect(events.documents.get(otherCardComment)?.markdown).toBe(
            "outro card"
        );
    });
});

describe("POST /boards/[id]/cards/[slug]/answers", () => {
    it("records the answers and closes the pending questions", async () => {
        const response = await answer(
            { questionEventId: questionId, answers: VALID_ANSWERS },
            "operator"
        );
        const data = await dataOf<AnswerQuestionsResultDTO>(response);

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(data.card.pendingAsk).toBeNull();
        expect(data.event).toMatchObject({
            type: "answer",
            stageKey: "analyze",
            questionEventId: questionId,
            author: { kind: "person", login: "qa-writer" },
            answers: [
                {
                    header: "Escopo",
                    choice: {
                        kind: "option",
                        option: 1,
                        label: "Título e corpo",
                    },
                },
                {
                    header: "Atalho",
                    choice: { kind: "text", text: "Usar o atalho /" },
                },
            ],
        });
        expect(events.documents.get(questionId)?.answeredByEventId).toBe(
            data.event.id
        );
    });

    it("asks the orchestrator to run the stage again, as who answered", async () => {
        await answer(
            { questionEventId: questionId, answers: VALID_ANSWERS },
            "operator"
        );

        expect(resumeAfterAnswerMock).toHaveBeenCalledTimes(1);
        expect(resumeAfterAnswerMock.mock.calls[0]?.[0]).toMatchObject({
            board: { id: BOARD_ID },
            slug: SLUG,
            by: { userId: PEOPLE.operator.id, login: "qa-writer" },
        });
    });

    it("keeps the answer when running the stage again fails", async () => {
        resumeAfterAnswerMock.mockRejectedValue(new Error("contention"));

        const response = await answer({
            questionEventId: questionId,
            answers: VALID_ANSWERS,
        });

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(events.documents.get(questionId)?.answeredByEventId).toEqual(
            expect.any(String)
        );
    });

    it("does not run the stage again when the answer is refused", async () => {
        await answer({ questionEventId: "other", answers: VALID_ANSWERS });

        expect(resumeAfterAnswerMock).not.toHaveBeenCalled();
    });

    it("refuses a second answer to the same questions", async () => {
        await answer({ questionEventId: questionId, answers: VALID_ANSWERS });

        const response = await answer({
            questionEventId: questionId,
            answers: VALID_ANSWERS,
        });

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CARD_QUESTIONS_NOT_PENDING");
    });

    it("refuses questions an agent has since replaced", async () => {
        const newer = events.seed({
            ...stageEvent,
            type: "question",
            questions: [QUESTIONS[0]],
        });

        const response = await answer({
            questionEventId: questionId,
            answers: VALID_ANSWERS,
        });

        expect(await errorCode(response)).toBe("CARD_QUESTIONS_NOT_PENDING");
        expect(
            (cards.documents.get(CARD_ID)?.pendingAsk as { eventId: string })
                .eventId
        ).toBe(newer);
    });

    it("refuses an option the question does not have", async () => {
        const response = await answer({
            questionEventId: questionId,
            answers: [
                { kind: "option", option: 3 },
                { kind: "option", option: 0 },
            ],
        });

        expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect(await errorCode(response)).toBe("CARD_ANSWERS_MISMATCH");
        expect(cards.documents.get(CARD_ID)?.pendingAsk).not.toBeNull();
    });

    it("refuses a viewer, who can still read and comment", async () => {
        const response = await answer(
            { questionEventId: questionId, answers: VALID_ANSWERS },
            "reader"
        );

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("BOARD_ROLE_INSUFFICIENT");
    });

    it("refuses a free text above the size limit", async () => {
        const response = await answer({
            questionEventId: questionId,
            answers: [
                { kind: "option", option: 0 },
                { kind: "text", text: "x".repeat(MAX_ANSWER_TEXT + 1) },
            ],
        });

        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    });
});

describe("timeline routes and the card's position", () => {
    it("never change the card's lane, stage or state", async () => {
        const before = cardPosition();

        const created = await dataOf<CardEventViewDTO>(await comment("oi"));
        await edit(created.id, "oi de novo");
        await remove(created.id);
        await answer({ questionEventId: questionId, answers: VALID_ANSWERS });

        expect(cardPosition()).toEqual(before);
    });
});
