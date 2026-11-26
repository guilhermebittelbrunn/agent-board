import type { globalTranslations } from "@repo/internationalization/translations/global";
import type {
    BoardConfigIssue,
    BoardConfigIssueParamValue,
} from "@repo/kanban-contract";

export type BoardsDictionary =
    (typeof globalTranslations)[keyof typeof globalTranslations]["apps"]["app"]["pages"]["common"]["boards"];

type IssueMessages = BoardsDictionary["issues"];

const STAGE_PATH = /^stages\[(\d+)\]/;

const paramText = (value: BoardConfigIssueParamValue): string =>
    Array.isArray(value) ? value.join(", ") : String(value);

/** Replaces every `{name}` of a dictionary template; unknown placeholders stay as written. */
export function fillMessage(
    template: string,
    params: Record<string, BoardConfigIssueParamValue | null | undefined>
): string {
    let message = template;
    for (const [name, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
            message = message.replaceAll(`{${name}}`, paramText(value));
        }
    }
    return message;
}

function templateFor(issue: BoardConfigIssue, messages: IssueMessages): string {
    switch (issue.rule) {
        case "required":
            return messages.required;
        case "wrong_type":
            return messages.wrongType;
        case "too_small":
            return messages.tooSmall;
        case "too_big":
            return messages.tooBig;
        case "bad_format":
            return messages.badFormat;
        case "not_allowed":
            return messages.notAllowed;
        case "stage_key_duplicated":
            return messages.stageKeyDuplicated;
        case "rework_target_invalid":
            return issue.params.suggestion === undefined
                ? messages.reworkTargetInvalidNoSuggestion
                : messages.reworkTargetInvalid;
        case "base_branch_unprotected":
            return messages.baseBranchUnprotected;
        case "yaml_syntax":
            return issue.params.line === undefined
                ? messages.yamlSyntaxNoPosition
                : messages.yamlSyntax;
        case "root_not_mapping":
            return messages.rootNotMapping;
        default:
            return messages.other;
    }
}

export function boardConfigIssueMessage(
    issue: BoardConfigIssue,
    messages: IssueMessages
): string {
    return fillMessage(templateFor(issue, messages), issue.params);
}

/** The stage index an issue points at, so the column preview can flag that column. */
export function stageIndexOf(issue: BoardConfigIssue): number | null {
    const match = STAGE_PATH.exec(issue.path);
    return match ? Number(match[1]) : null;
}
