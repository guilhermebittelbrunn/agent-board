import { parseBoardConfig } from "@repo/kanban-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import { type CardRecord, cardMapper } from "@/(shared)/mappers/card.mapper";
import {
    createFakeCardRepository,
    type FakeCardRepository,
} from "./fakeCardRepository";

const { cardStore } = vi.hoisted(() => ({
    cardStore: { current: null as FakeCardRepository | null },
}));

vi.mock("@/(shared)/lib/storage", () => ({
    isStorageConfigured: () => true,
    isAttachmentObjectPath: () => true,
    isOwnedBy: () => true,
    objectIdOf: (path: string) => path,
    readObjectMetadata: vi.fn(),
}));

vi.mock("@/(shared)/lib/github/github-client", () => ({
    getGithubClient: () => null,
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

const { isDraftSlugFree, planSpecApproval, slugFromRequest, titleFromRequest } =
    await import("@/(shared)/lib/spec-draft");

const BOARD_ID = "agent-board-demo--sample-app";
const parsed = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
if (!parsed.success) {
    throw parsed.error;
}
const config = parsed.data;
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
const github = createGithubFakeClient(createGithubPermissionCache());
const NOW = new Date("2026-11-27T10:00:00.000Z");
const SLUG_MAX = 48;
const TITLE_MAX = 140;

let cards: FakeCardRepository;
beforeEach(() => {
    cards = createFakeCardRepository();
    cardStore.current = cards;
});

describe("slugFromRequest", () => {
    it("takes the first five words, without accents or punctuation", () => {
        expect(
            slugFromRequest(
                "Quero ser avisado, no Slack, quando um card parar esperando!"
            )
        ).toBe("quero-ser-avisado-no-slack");
        expect(slugFromRequest("Ação de exportação: CSV & PDF")).toBe(
            "acao-de-exportacao-csv-pdf"
        );
    });

    it("falls back to spec when nothing is left", () => {
        expect(slugFromRequest("  !!! ¿¿ ")).toBe("spec");
    });

    it("stops at 48 characters on a word boundary", () => {
        const slug = slugFromRequest(
            "internacionalizacao multiplataforma descentralizada responsabilidade extraordinariamente"
        );

        expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
        expect(slug).toBe("internacionalizacao-multiplataforma");
    });
});

describe("titleFromRequest", () => {
    it("uses the first non-empty line, cut at 140 characters", () => {
        expect(titleFromRequest("\n\n  Alertas no Slack \nresto")).toBe(
            "Alertas no Slack"
        );
        expect(titleFromRequest("a".repeat(TITLE_MAX + 1))).toHaveLength(
            TITLE_MAX
        );
    });
});

describe("isDraftSlugFree", () => {
    const free = (slug: string, boardConfig = config) =>
        isDraftSlugFree({
            board: { ...board, config: boardConfig },
            slug,
            github,
        });

    it("accepts a slug nobody uses", async () => {
        expect(await free("csv-export-alerts")).toBe(true);
        expect(await free("slack-alerts")).toBe(false);
    });

    it("refuses a slug taken by a card, even a discarded one", async () => {
        cards.seed(BOARD_ID, "taken");
        cards.seed(BOARD_ID, "discarded", { deletedAt: NOW });

        expect(await free("taken")).toBe(false);
        expect(await free("discarded")).toBe(false);
    });

    it("refuses a slug whose spec is already on the base branch", async () => {
        expect(await free("search-cards")).toBe(false);
    });

    it("refuses a route name and a slug that gives a protected branch", async () => {
        expect(await free("sync")).toBe(false);
        expect(await free("main", { ...config, branchPattern: "{slug}" })).toBe(
            false
        );
    });
});

describe("planSpecApproval", () => {
    const draft: CardRecord = cardMapper.toDTO({
        id: `${BOARD_ID}__slack-alerts`,
        boardId: BOARD_ID,
        slug: "slack-alerts",
        title: "Quero alertas",
        lane: "drafts",
        stageKey: "spec",
        origin: "board",
        branch: "feat/slack-alerts",
        spec: {
            path: "specs/features/slack-alerts.md",
            sha: "",
            status: "",
            ref: "feat/slack-alerts",
        },
    });
    const by = { userId: "u1", login: "octo" };
    const plan = (content: string | null) =>
        planSpecApproval({
            card: draft,
            file: content === null ? null : { content, sha: "abc" },
            config,
            by,
            order: 7,
            now: NOW,
        });

    it("moves the draft to Tasks as ready, with the frontmatter title", () => {
        expect(
            plan(
                "---\nid: slack-alerts\ntitle: Alertas no Slack\nstatus: proposed\n---\n"
            )
        ).toEqual({
            ok: true,
            patch: expect.objectContaining({
                lane: "tasks",
                stageKey: null,
                ready: true,
                order: 7,
                title: "Alertas no Slack",
                spec: {
                    path: "specs/features/slack-alerts.md",
                    sha: "abc",
                    status: "approved",
                    ref: "feat/slack-alerts",
                },
                specApproval: { userId: "u1", login: "octo", at: NOW },
            }),
        });
    });

    it("refuses a missing file, a file without frontmatter and another id", () => {
        expect(plan(null)).toMatchObject({ code: "CARD_SPEC_DRAFT_MISSING" });
        expect(plan("# Sem cabeçalho\n")).toMatchObject({
            code: "CARD_SPEC_DRAFT_INVALID",
        });
        expect(plan("---\nid: other\nstatus: proposed\n---\n")).toMatchObject({
            code: "CARD_SPEC_DRAFT_INVALID",
        });
    });
});
