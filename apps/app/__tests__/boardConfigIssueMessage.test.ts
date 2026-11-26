import { globalTranslations } from "@repo/internationalization/translations/global";
import {
    BOARD_CONFIG_ISSUE_RULES,
    type BoardConfigIssue,
} from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import {
    boardConfigIssueMessage,
    fillMessage,
    stageIndexOf,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/boardConfigIssueMessage";

const LEFTOVER_PLACEHOLDER = /\{\w+\}/;

const issueMessages =
    globalTranslations["pt-br"].apps.app.pages.common.boards.issues;

const issue = (
    rule: BoardConfigIssue["rule"],
    params: BoardConfigIssue["params"] = {},
    path = "stages[2].onRework"
): BoardConfigIssue => ({ path, rule, params });

describe("boardConfigIssueMessage", () => {
    it("explains an invalid rework target with the suggestion", () => {
        expect(
            boardConfigIssueMessage(
                issue("rework_target_invalid", {
                    stageColumn: "Revisando",
                    target: "deploy",
                    suggestion: "develop",
                }),
                issueMessages
            )
        ).toBe(
            "A etapa Revisando devolve o card para deploy, que não existe antes dela. Aponte para uma etapa anterior, como develop."
        );
    });

    it("drops the suggestion sentence when there is none", () => {
        expect(
            boardConfigIssueMessage(
                issue("rework_target_invalid", {
                    stageColumn: "Análise",
                    target: "analyze",
                }),
                issueMessages
            )
        ).toBe(
            "A etapa Análise devolve o card para analyze, que não existe antes dela."
        );
    });

    it("joins the allowed values of a list", () => {
        expect(
            boardConfigIssueMessage(
                issue("not_allowed", { allowed: ["opus", "sonnet"] }),
                issueMessages
            )
        ).toBe("Valor não permitido. Use um destes: opus, sonnet.");
    });

    it("places the YAML position, or explains without it", () => {
        expect(
            boardConfigIssueMessage(
                issue("yaml_syntax", { line: 3, column: 1 }, ""),
                issueMessages
            )
        ).toBe("O arquivo não é um YAML válido (linha 3, coluna 1).");
        expect(
            boardConfigIssueMessage(issue("yaml_syntax", {}, ""), issueMessages)
        ).toBe(issueMessages.yamlSyntaxNoPosition);
    });

    it("has a sentence with no placeholder left for every rule", () => {
        const fullParams = {
            minimum: 1,
            maximum: 5,
            allowed: ["a"],
            key: "k",
            stageColumn: "C",
            target: "t",
            suggestion: "s",
            baseBranch: "main",
            line: 1,
            column: 1,
        };
        for (const rule of BOARD_CONFIG_ISSUE_RULES) {
            const message = boardConfigIssueMessage(
                issue(rule, fullParams),
                issueMessages
            );
            expect(message, rule).toBeTruthy();
            expect(message, rule).not.toMatch(LEFTOVER_PLACEHOLDER);
        }
    });

    it("falls back to the generic sentence for an unknown rule", () => {
        expect(
            boardConfigIssueMessage(
                issue("brand_new" as BoardConfigIssue["rule"]),
                issueMessages
            )
        ).toBe(issueMessages.other);
    });
});

describe("fillMessage", () => {
    it("keeps a placeholder without a value as written", () => {
        expect(fillMessage("{a} e {b}", { a: 1, b: null })).toBe("1 e {b}");
    });
});

describe("stageIndexOf", () => {
    it("reads the stage index of a stage path only", () => {
        expect(stageIndexOf(issue("other", {}, "stages[2].onRework"))).toBe(2);
        expect(stageIndexOf(issue("other", {}, "stages"))).toBeNull();
        expect(stageIndexOf(issue("other", {}, "baseBranch"))).toBeNull();
    });
});
