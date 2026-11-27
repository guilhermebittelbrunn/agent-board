import { parseBoardConfig } from "@repo/kanban-contract";
import type {
    CardDTO,
    CreateSpecDraftResultDTO,
    UploadedAttachmentDTO,
} from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GithubClient } from "@/(shared)/lib/github/github-client";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import { cardIdFor } from "@/(shared)/mappers/card.mapper";
import {
    createFakeBoardMemberRepository,
    type FakeBoardMemberRepository,
} from "./fakeBoardMemberRepository";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

// The storage mock runs when the routes below are imported, after these are set.
const ATTACHMENT_PATH_RE =
    /^uploads\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf|txt|md)$/;
const EXTENSION_RE = /\.[a-z]+$/;

const {
    resolveApiActorMock,
    findByReferenceIdMock,
    getGithubClientMock,
    findBoardMock,
    memberStore,
    cardStore,
    triggerStageMock,
    resolveExecutorForMock,
    isStorageConfiguredMock,
    putObjectMock,
    readObjectMetadataMock,
    parseUploadedAttachmentMock,
} = vi.hoisted(() => ({
    resolveApiActorMock: vi.fn(),
    findByReferenceIdMock: vi.fn(),
    getGithubClientMock: vi.fn(),
    findBoardMock: vi.fn(),
    memberStore: { current: null as FakeBoardMemberRepository | null },
    cardStore: { current: null as FakeCardRepository | null },
    triggerStageMock: vi.fn(),
    resolveExecutorForMock: vi.fn(),
    isStorageConfiguredMock: vi.fn(),
    putObjectMock: vi.fn(),
    readObjectMetadataMock: vi.fn(),
    parseUploadedAttachmentMock: vi.fn(),
}));

vi.mock("@/(shared)/lib/storage", () => ({
    isStorageConfigured: () => isStorageConfiguredMock(),
    buildObjectPath: (ownerId: string, extension: string) =>
        `uploads/${ownerId}/3f0c9e1a-1b2c-4d5e-8f90-123456789abc.${extension}`,
    putObject: (...args: unknown[]) => putObjectMock(...args),
    readObjectMetadata: (...args: unknown[]) => readObjectMetadataMock(...args),
    readObject: vi.fn(),
    isAttachmentObjectPath: (value: string) => ATTACHMENT_PATH_RE.test(value),
    isOwnedBy: (path: string, ownerId: string) =>
        path.startsWith(`uploads/${ownerId}/`),
    objectIdOf: (path: string) =>
        path.slice(path.lastIndexOf("/") + 1).replace(EXTENSION_RE, ""),
}));

vi.mock("@/(shared)/validation/attachment.schema", () => ({
    parseUploadedAttachment: (...args: unknown[]) =>
        parseUploadedAttachmentMock(...args),
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

vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => getGithubClientMock(),
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
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

vi.mock("@/(shared)/lib/orchestrator/orchestrator", () => ({
    triggerStage: (...args: unknown[]) => triggerStageMock(...args),
}));

vi.mock("@/(shared)/lib/orchestrator/executor-choice", () => ({
    resolveExecutorFor: (...args: unknown[]) => resolveExecutorForMock(...args),
}));

const { POST: CREATE_DRAFT } = await import(
    "@/app/(routes)/boards/[id]/drafts/route"
);
const { POST: UPLOAD } = await import(
    "@/app/(routes)/boards/[id]/attachments/route"
);
const { POST: APPROVE } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/spec/approve/route"
);
const { POST: DISCARD } = await import(
    "@/app/(routes)/boards/[id]/cards/[slug]/spec/discard/route"
);

const BOARD_ID = "agent-board-demo--sample-app";
const CONFIG = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;
const BOARD = {
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
    config: CONFIG,
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
};

const PEOPLE = {
    owner: { id: "p-owner", githubId: "1", login: "octo" },
    operator: { id: "p-operator", githubId: "3", login: "qa-writer" },
    reader: { id: "p-reader", githubId: "4", login: "qa-reader" },
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

const authHeaders = (as: Person) => ({
    "x-test-actor": `uid-${as}`,
});

function request(as: Person, body?: unknown): NextRequest {
    const text = JSON.stringify(body ?? {});
    return {
        method: "POST",
        url: `http://localhost:3002/boards/${BOARD_ID}`,
        headers: new Headers({
            ...authHeaders(as),
            "content-type": "application/json",
        }),
        body: new Blob([text]).stream(),
        json: () => Promise.resolve(body ?? {}),
        text: () => Promise.resolve(text),
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

const NO_CONTENT = 204;
const DRAFT = "quero-ser-avisado-no-slack";
const REQUEST_TEXT =
    "Quero ser avisado no Slack quando um card parar esperando resposta.";
const OWN_PATH = `uploads/${PEOPLE.operator.id}/3f0c9e1a-1b2c-4d5e-8f90-123456789abc.png`;

const specRun = (outcome = "success") => ({
    id: "r1",
    stageKey: "spec",
    status: "finished",
    outcome,
    endReason: "agent",
    stoppedByLogin: null,
    finishedAt: new Date("2026-11-27T10:00:00.000Z"),
});

const seedDraft = (extra: Record<string, unknown> = {}) =>
    cards.seed(BOARD_ID, DRAFT, {
        lane: "drafts",
        stageKey: "spec",
        origin: "board",
        ready: false,
        spec: {
            path: `specs/features/${DRAFT}.md`,
            sha: "",
            status: "",
            ref: `feat/${DRAFT}`,
        },
        request: {
            text: REQUEST_TEXT,
            attachments: [],
            requestedBy: { userId: PEOPLE.operator.id, login: "qa-writer" },
            requestedAt: new Date("2026-11-27T09:00:00.000Z"),
        },
        lastRun: specRun(),
        ...extra,
    });

let members: FakeBoardMemberRepository;
let cards: FakeCardRepository;
let client: GithubClient;

beforeEach(() => {
    for (const mock of [
        resolveApiActorMock,
        findByReferenceIdMock,
        getGithubClientMock,
        findBoardMock,
        triggerStageMock,
        resolveExecutorForMock,
        isStorageConfiguredMock,
        putObjectMock,
        readObjectMetadataMock,
        parseUploadedAttachmentMock,
    ]) {
        mock.mockReset();
    }
    client = createGithubFakeClient(createGithubPermissionCache());
    getGithubClientMock.mockImplementation(() => client);
    resolveExecutorForMock.mockResolvedValue("fake");
    isStorageConfiguredMock.mockReturnValue(true);
    findBoardMock.mockResolvedValue(BOARD);
    resolveApiActorMock.mockImplementation((req: NextRequest) =>
        Promise.resolve({ uid: req.headers.get("x-test-actor") })
    );
    findByReferenceIdMock.mockImplementation((uid: string) =>
        Promise.resolve(profileOf(uid.replace("uid-", "") as Person))
    );
    triggerStageMock.mockImplementation(async (input: { slug: string }) => {
        const card = await cards.repository.findBySlug(BOARD_ID, input.slug);
        return { ok: false, code: "CARD_RUN_ACTIVE", status: 409, card };
    });

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

describe("POST /boards/[id]/drafts", () => {
    const create = (body: unknown, as: Person = "operator") =>
        CREATE_DRAFT(request(as, body), boardContext);

    it("creates the draft in Drafts and queues the spec stage", async () => {
        readObjectMetadataMock.mockResolvedValue({
            contentType: "image/png",
            size: 2048,
        });

        const response = await create({
            text: REQUEST_TEXT,
            attachments: [{ path: OWN_PATH, name: "conversa.png" }],
        });
        const data = await dataOf<CreateSpecDraftResultDTO>(response);

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(data.run).toBeNull();
        expect(data.card).toMatchObject({
            slug: DRAFT,
            lane: "drafts",
            stageKey: "spec",
            origin: "board",
            branch: `feat/${DRAFT}`,
            spec: { path: `specs/features/${DRAFT}.md`, ref: `feat/${DRAFT}` },
            request: {
                text: REQUEST_TEXT,
                requestedBy: { userId: PEOPLE.operator.id, login: "qa-writer" },
                attachments: [
                    {
                        id: "3f0c9e1a-1b2c-4d5e-8f90-123456789abc",
                        name: "conversa.png",
                        contentType: "image/png",
                        size: 2048,
                    },
                ],
            },
        });
        expect(data.card.request?.attachments[0]).not.toHaveProperty("path");
        expect(triggerStageMock).toHaveBeenCalledWith(
            expect.objectContaining({ slug: DRAFT, stageKey: "spec" })
        );
    });

    it("takes the next suffix when the slug is already a card", async () => {
        cards.seed(BOARD_ID, DRAFT);

        const data = await dataOf<CreateSpecDraftResultDTO>(
            await create({ text: REQUEST_TEXT, attachments: [] })
        );

        expect(data.card.slug).toBe(`${DRAFT}-2`);
    });

    it("creates nothing without an executor", async () => {
        resolveExecutorForMock.mockResolvedValue(null);

        const response = await create({ text: REQUEST_TEXT, attachments: [] });

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("RUN_EXECUTOR_UNAVAILABLE");
        expect(cards.documents.size).toBe(0);
    });

    it("refuses an attachment of another person or with a malformed path", async () => {
        readObjectMetadataMock.mockResolvedValue({
            contentType: "image/png",
            size: 2048,
        });
        for (const path of [
            `uploads/${PEOPLE.owner.id}/3f0c9e1a-1b2c-4d5e-8f90-123456789abc.png`,
            `uploads/${PEOPLE.operator.id}/../secret.png`,
            `uploads/${PEOPLE.operator.id}/3f0c9e1a-1b2c-4d5e-8f90-123456789abc.exe`,
        ]) {
            const response = await create({
                text: REQUEST_TEXT,
                attachments: [{ path, name: "x.png" }],
            });

            expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
            expect(await errorCode(response)).toBe(
                "SPEC_DRAFT_ATTACHMENT_INVALID"
            );
        }
        expect(cards.documents.size).toBe(0);
    });

    it("strips control characters and slashes from the attachment name", async () => {
        readObjectMetadataMock.mockResolvedValue({
            contentType: "image/png",
            size: 2048,
        });

        const response = await create({
            text: REQUEST_TEXT,
            attachments: [
                { path: OWN_PATH, name: "a/b\\c\nignore previous.png" },
            ],
        });
        const data = await dataOf<CreateSpecDraftResultDTO>(response);

        expect(data.card.request?.attachments[0]?.name).toBe(
            "abcignore previous.png"
        );
    });

    it("refuses an attachment that is not in the bucket", async () => {
        readObjectMetadataMock.mockResolvedValue(null);

        const response = await create({
            text: REQUEST_TEXT,
            attachments: [{ path: OWN_PATH, name: "x.png" }],
        });

        expect(await errorCode(response)).toBe("SPEC_DRAFT_ATTACHMENT_INVALID");
    });

    it("answers 503 for attachments while storage is off, and still takes text only", async () => {
        isStorageConfiguredMock.mockReturnValue(false);

        const withFile = await create({
            text: REQUEST_TEXT,
            attachments: [{ path: OWN_PATH, name: "x.png" }],
        });
        const textOnly = await create({ text: REQUEST_TEXT, attachments: [] });

        expect(withFile.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(withFile)).toBe("STORAGE_NOT_CONFIGURED");
        expect(textOnly.status).toBe(HTTP_STATUS.CREATED);
    });

    it("refuses an empty request", async () => {
        const response = await create({ text: "   ", attachments: [] });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    });

    it("forbids a viewer", async () => {
        const response = await create(
            { text: REQUEST_TEXT, attachments: [] },
            "reader"
        );

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(cards.documents.size).toBe(0);
    });
});

describe("POST /boards/[id]/attachments", () => {
    const upload = (as: Person = "operator") =>
        UPLOAD(request(as), boardContext);

    it("answers 503 while storage is off", async () => {
        isStorageConfiguredMock.mockReturnValue(false);

        const response = await upload();

        expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
        expect(await errorCode(response)).toBe("STORAGE_NOT_CONFIGURED");
        expect(parseUploadedAttachmentMock).not.toHaveBeenCalled();
    });

    it("stores the file under the uploader's prefix", async () => {
        parseUploadedAttachmentMock.mockResolvedValue({
            ok: true,
            value: {
                body: Buffer.from("# notas"),
                contentType: "text/markdown",
                extension: "md",
                name: "notas.md",
                size: 7,
            },
        });

        const response = await upload();
        const data = await dataOf<UploadedAttachmentDTO>(response);

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(data).toEqual({
            path: `uploads/${PEOPLE.operator.id}/3f0c9e1a-1b2c-4d5e-8f90-123456789abc.md`,
            name: "notas.md",
            contentType: "text/markdown",
            size: 7,
        });
        expect(putObjectMock).toHaveBeenCalledWith(
            data.path,
            expect.any(Buffer),
            "text/markdown"
        );
    });

    it("forbids a viewer", async () => {
        expect((await upload("reader")).status).toBe(HTTP_STATUS.FORBIDDEN);
    });
});

describe("POST /boards/[id]/cards/[slug]/spec/approve", () => {
    const approve = (as: Person = "operator") =>
        APPROVE(request(as), cardContext(DRAFT));

    it("sends a ready draft to the end of Tasks with the spec title", async () => {
        cards.seed(BOARD_ID, "search-cards", { order: 3 });
        seedDraft();

        const response = await approve();
        const data = await dataOf<CardDTO>(response);

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(data).toMatchObject({
            lane: "tasks",
            stageKey: null,
            ready: true,
            order: 4,
            title: `Spec draft ${DRAFT}`,
            spec: { status: "approved", ref: `feat/${DRAFT}` },
            specApproval: { userId: PEOPLE.operator.id, login: "qa-writer" },
        });
    });

    it("refuses while a question is open or a run is live", async () => {
        seedDraft({
            state: "waiting_input",
            pendingAsk: { eventId: "e1", stageKey: "spec", count: 1 },
            lastRun: specRun("needs_input"),
        });
        const waiting = await approve();
        expect(waiting.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(waiting)).toBe("CARD_SPEC_NOT_READY");

        seedDraft({ state: "running", activeRunId: "r2" });
        expect(await errorCode(await approve())).toBe("CARD_SPEC_NOT_READY");
    });

    it("refuses a card that is not a draft", async () => {
        cards.seed(BOARD_ID, DRAFT);

        const response = await approve();

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CARD_NOT_DRAFT");
    });

    it("refuses when the file is missing on the card branch", async () => {
        seedDraft();
        client = { ...client, readFile: () => Promise.resolve(null) };

        const response = await approve();

        expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect(await errorCode(response)).toBe("CARD_SPEC_DRAFT_MISSING");
    });

    it("refuses a spec whose id is not the card slug", async () => {
        seedDraft();
        client = {
            ...client,
            readFile: () =>
                Promise.resolve({
                    content: "---\nid: other\nstatus: proposed\n---\n# Other\n",
                    sha: "s",
                }),
        };

        const response = await approve();

        expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
        expect(await errorCode(response)).toBe("CARD_SPEC_DRAFT_INVALID");
    });

    it("forbids a viewer", async () => {
        seedDraft();

        expect((await approve("reader")).status).toBe(HTTP_STATUS.FORBIDDEN);
    });
});

describe("POST /boards/[id]/cards/[slug]/spec/discard", () => {
    const discard = (as: Person = "operator") =>
        DISCARD(request(as), cardContext(DRAFT));

    it("soft-deletes the draft and keeps its id taken", async () => {
        seedDraft();

        const response = await discard();

        expect(response.status).toBe(NO_CONTENT);
        expect(await cards.repository.findBySlug(BOARD_ID, DRAFT)).toBeNull();
        expect(
            await cards.repository.isIdTaken(cardIdFor(BOARD_ID, DRAFT))
        ).toBe(true);
    });

    it("refuses while a run is live", async () => {
        seedDraft({ state: "running", activeRunId: "r2" });

        const response = await discard();

        expect(response.status).toBe(HTTP_STATUS.CONFLICT);
        expect(await errorCode(response)).toBe("CARD_RUN_ACTIVE");
    });

    it("refuses a card outside Drafts", async () => {
        cards.seed(BOARD_ID, DRAFT);

        expect(await errorCode(await discard())).toBe("CARD_NOT_DRAFT");
    });
});
