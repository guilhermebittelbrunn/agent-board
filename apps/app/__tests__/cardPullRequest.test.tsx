import { globalTranslations } from "@repo/internationalization/translations/global";
import { parseBoardConfig } from "@repo/kanban-contract";
import type {
    BoardViewDTO,
    CardDTO,
    CardPullRequestDTO,
} from "@repo/sdk/src/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardCardItem } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardCardItem";
import { CardPullRequest } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CardPullRequest";
import { cardRunReason } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/cardRunReason";
import { runCard } from "./runCardFixtures";

const { mutateMock, pending } = vi.hoisted(() => ({
    mutateMock: vi.fn(),
    pending: { value: false },
}));

vi.mock(
    "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCardCrud",
    () => ({
        useBoardCardCrud: () => ({
            openPullRequestMutation: {
                mutate: mutateMock,
                isPending: pending.value,
            },
        }),
    })
);

vi.mock("@/shared/lib/formatDisplayDateTime", () => ({
    useFormatDisplayDateTime: () => (value: string) => `em-${value}`,
}));

const PULL_REQUEST_LINE = /PR #12/;

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;
const apiErrors = globalTranslations["pt-br"].packages.utils.apiErrors;

const parsed = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [
        { key: "test", column: "Testando", command: "/test" },
        {
            key: "pr",
            column: "Aguardando PR",
            command: "/observe",
            onPrComment: "/mediate",
            pullRequest: {},
        },
    ],
});
if (!parsed.success) {
    throw new Error("invalid config");
}
const PR_CONFIG = parsed.data;

const board = (role: "operator" | "viewer" = "operator") =>
    ({
        id: "b",
        config: PR_CONFIG,
        access: { effectiveRole: role },
    }) as unknown as BoardViewDTO;

const pullRequest = (
    extra: Partial<CardPullRequestDTO> = {}
): CardPullRequestDTO => ({
    number: 12,
    url: "https://github.com/acme/app/pull/12",
    title: "Login",
    draft: true,
    state: "open",
    headRef: "feat/login",
    baseRef: "main",
    headSha: "sha",
    commits: 3,
    openedAt: "2026-11-27T10:00:00.000Z",
    openedByBoard: true,
    closedAt: null,
    closedByLogin: null,
    checks: [],
    reviews: [],
    checksSummary: "pending",
    reviewsSummary: null,
    pendingComment: false,
    ...extra,
});

const MERGE_NOTE =
    "O merge é sempre seu. Quando a PR for mergeada, o card vai para Concluído.";

const prCard = (overrides: Partial<CardDTO> = {}) =>
    runCard("login", { stageKey: "pr", ...overrides });

const draw = (card: CardDTO, role: "operator" | "viewer" = "operator") =>
    render(
        <CardPullRequest
            board={board(role)}
            boardsDictionary={boardsDictionary}
            card={card}
        />
    );

beforeEach(() => {
    mutateMock.mockReset();
    pending.value = false;
});
afterEach(cleanup);

describe("CardPullRequest", () => {
    it("renders nothing without a pull request nor an error", () => {
        const { container } = draw(prCard());

        expect(container.innerHTML).toBe("");
    });

    it("shows an open draft with its branches, commits and empty lists", () => {
        draw(prCard({ pullRequest: pullRequest() }));

        const link = screen.getByRole("link", { name: "#12 Login" });
        expect(link.getAttribute("href")).toBe(
            "https://github.com/acme/app/pull/12"
        );
        expect(link.getAttribute("rel")).toBe("noreferrer noopener");
        expect(screen.getByText("Rascunho")).toBeTruthy();
        expect(screen.getByText("Aberta")).toBeTruthy();
        expect(
            screen.getByText(
                "feat/login → main · 3 commits · aberta pelo board em em-2026-11-27T10:00:00.000Z"
            )
        ).toBeTruthy();
        expect(screen.getByText("Nenhum check concluído ainda")).toBeTruthy();
        expect(screen.getByText("Nenhuma review ainda")).toBeTruthy();
        expect(
            screen.getByText(
                "O merge é sempre seu. Quando a PR for mergeada, o card vai para Concluído."
            )
        ).toBeTruthy();
    });

    it("lists checks with the summary and reviews by person", () => {
        draw(
            prCard({
                pullRequest: pullRequest({
                    checks: [
                        {
                            app: "github-actions",
                            name: "CI",
                            conclusion: "failure",
                            headSha: "sha",
                            at: "2026-11-27T10:00:00.000Z",
                        },
                    ],
                    checksSummary: "failure",
                    reviews: [
                        {
                            login: "qa-pr-flow",
                            state: "changes_requested",
                            at: "2026-11-27T10:00:00.000Z",
                        },
                    ],
                    pendingComment: true,
                }),
            })
        );

        expect(screen.getByText("Checks falhando")).toBeTruthy();
        expect(screen.getByText("Falhou")).toBeTruthy();
        expect(screen.getByText("@qa-pr-flow")).toBeTruthy();
        expect(screen.getByText("Pediu mudanças")).toBeTruthy();
        expect(
            screen.getByText("Comentário novo esperando o /mediate")
        ).toBeTruthy();
    });

    it("shows who merged and who closed without merge", () => {
        draw(
            prCard({
                lane: "done",
                stageKey: null,
                pullRequest: pullRequest({
                    state: "merged",
                    closedByLogin: "merger",
                }),
            })
        );
        expect(screen.getByText("Mergeada")).toBeTruthy();
        expect(screen.getByText("Mergeada por @merger")).toBeTruthy();
        expect(screen.queryByText("Rascunho")).toBeNull();
        expect(screen.queryByText(MERGE_NOTE)).toBeNull();

        cleanup();
        draw(
            prCard({
                lane: "tasks",
                stageKey: null,
                pullRequest: pullRequest({
                    state: "closed",
                    closedByLogin: "closer",
                }),
            })
        );
        expect(screen.getByText("Fechada sem merge por @closer")).toBeTruthy();
    });

    it("translates the failure and lets an operator try again", () => {
        const card = prCard({
            pullRequestError: {
                code: "GITHUB_APP_PERMISSION_MISSING",
                at: "2026-11-27T10:00:00.000Z",
            },
        });
        draw(card);

        expect(screen.getByText("Não foi possível abrir a PR")).toBeTruthy();
        expect(
            screen.getByText(apiErrors.GITHUB_APP_PERMISSION_MISSING)
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
        expect(mutateMock).toHaveBeenCalledWith(card);
    });

    it("blocks a second click while opening", () => {
        pending.value = true;
        draw(
            prCard({
                pullRequestError: {
                    code: "GITHUB_PULL_REQUEST_REJECTED",
                    at: "2026-11-27T10:00:00.000Z",
                },
            })
        );

        const button = screen.getByRole("button", { name: "Abrindo…" });
        expect(button.hasAttribute("disabled")).toBe(true);
    });

    it("drops the opening failure once the card leaves the pull request stage", () => {
        const pullRequestError = {
            code: "GITHUB_APP_PERMISSION_MISSING",
            at: "2026-11-27T10:00:00.000Z",
        };

        const inTasks = draw(
            prCard({ lane: "tasks", stageKey: null, pullRequestError })
        );
        expect(inTasks.container.innerHTML).toBe("");
        inTasks.unmount();

        const inDone = draw(
            prCard({ lane: "done", stageKey: null, pullRequestError })
        );
        expect(inDone.container.innerHTML).toBe("");
    });

    it("drops the failure once the card left the pull request stage", () => {
        const { container } = draw(
            prCard({
                lane: "tasks",
                stageKey: null,
                pullRequestError: {
                    code: "GITHUB_APP_PERMISSION_MISSING",
                    at: "2026-11-27T10:00:00.000Z",
                },
            })
        );

        expect(container.innerHTML).toBe("");
    });

    it("hides the retry from a viewer", () => {
        draw(
            prCard({
                pullRequestError: {
                    code: "GITHUB_APP_PERMISSION_MISSING",
                    at: "2026-11-27T10:00:00.000Z",
                },
            }),
            "viewer"
        );

        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("BoardCardItem pull request line", () => {
    const drawItem = (card: CardDTO) =>
        render(
            <BoardCardItem
                boardsDictionary={boardsDictionary}
                card={card}
                draggable={false}
                href="/boards/b/cards/login"
                isDragging={false}
                menu={null}
                onDragEnd={vi.fn()}
                onDragStart={vi.fn()}
                position={null}
            />
        );

    it("shows the open pull request with the checks summary for screen readers", () => {
        const { container } = drawItem(
            prCard({
                lane: "stage",
                pullRequest: pullRequest({ checksSummary: "failure" }),
            })
        );

        expect(screen.getByText("PR #12")).toBeTruthy();
        expect(screen.getByText("checks falhando").className).toContain(
            "sr-only"
        );
        expect(container.querySelector(".bg-destructive")).not.toBeNull();
    });

    it("shows a pull request closed without merge on a card back in Tasks", () => {
        drawItem(
            prCard({
                lane: "tasks",
                stageKey: null,
                pullRequest: pullRequest({ state: "closed" }),
            })
        );

        expect(screen.getByText("PR #12 fechada sem merge")).toBeTruthy();
    });

    it("hides the line once the pull request is merged", () => {
        drawItem(
            prCard({
                lane: "done",
                stageKey: null,
                pullRequest: pullRequest({ state: "merged" }),
            })
        );

        expect(screen.queryByText(PULL_REQUEST_LINE)).toBeNull();
    });
});

describe("cardRunReason on the pull request stage", () => {
    it("says the card waits for the merge after its command succeeded", () => {
        const card = prCard({
            pullRequest: pullRequest(),
            lastRun: {
                id: "r1",
                stageKey: "pr",
                status: "finished",
                outcome: "success",
                endReason: "agent",
                stoppedByLogin: null,
                finishedAt: "2026-11-27T10:00:00.000Z",
            },
        });

        expect(cardRunReason(card, PR_CONFIG, boardsDictionary)).toBe(
            "Aguardando o merge"
        );
        expect(
            cardRunReason(
                { ...card, pullRequest: null },
                PR_CONFIG,
                boardsDictionary
            )
        ).toBeNull();
    });
});
