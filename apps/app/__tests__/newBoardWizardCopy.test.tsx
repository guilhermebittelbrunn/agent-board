import { commonBoardsPageTranslations } from "@repo/internationalization/translations/apps/app/pages/common/boards";
import type { BoardImportPreviewDTO } from "@repo/sdk/src/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
    blockedCreateHint,
    repositoryAccessLine,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/newBoardWizardCopy";
import { RepositorySummary } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RepositorySummary";

const boardsDictionary = commonBoardsPageTranslations["pt-br"];
const readConfigCopy = boardsDictionary.wizard.readConfig;
const footerCopy = boardsDictionary.wizard.footer;

const preview = (
    overrides: Partial<BoardImportPreviewDTO> = {}
): BoardImportPreviewDTO => ({
    repository: {
        installationId: 1,
        owner: "agent-board-demo",
        name: "sample-app",
        fullName: "agent-board-demo/sample-app",
        defaultBranch: "main",
        private: false,
    },
    githubRole: "admin",
    board: null,
    status: "valid",
    file: { path: ".kanban/board.yml", ref: "main", sha: "abc1234" },
    config: null,
    rawStages: null,
    issues: [],
    ...overrides,
});

describe("repositoryAccessLine", () => {
    it("states the access only once the preview answered for a repository without a board", () => {
        expect(repositoryAccessLine(preview(), readConfigCopy)).toBe(
            readConfigCopy.repositoryLine
        );
    });

    it("says nothing while the preview failed or has not answered", () => {
        expect(repositoryAccessLine(undefined, readConfigCopy)).toBeNull();
    });

    it("says nothing when the repository already has a board", () => {
        expect(
            repositoryAccessLine(preview({ board: "taken" }), readConfigCopy)
        ).toBeNull();
        expect(
            repositoryAccessLine(
                preview({ board: { boardId: "agent-board-demo--sample-app" } }),
                readConfigCopy
            )
        ).toBeNull();
    });
});

describe("blockedCreateHint", () => {
    it("asks to fix an invalid file and to apply the kit when the file is missing", () => {
        expect(
            blockedCreateHint(preview({ status: "invalid" }), footerCopy)
        ).toBe(footerCopy.fixToContinue);
        expect(
            blockedCreateHint(preview({ status: "missing" }), footerCopy)
        ).toBe(footerCopy.addFileToContinue);
        expect(blockedCreateHint(preview(), footerCopy)).toBeNull();
    });
});

describe("RepositorySummary", () => {
    it("renders no access line when it is null", () => {
        render(
            <RepositorySummary
                accessLine={null}
                boardsDictionary={boardsDictionary}
                fullName="someone/else"
                onChange={vi.fn()}
            />
        );

        expect(screen.getByText("someone/else")).toBeTruthy();
        expect(screen.queryByText(readConfigCopy.repositoryLine)).toBeNull();
    });
});
