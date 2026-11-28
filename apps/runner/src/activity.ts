import path from "node:path";

const MAX_DETAIL = 120;
const MAX_TEXT = 160;
const WHITESPACE = /\s+/g;
const KANBAN_PREFIX = "mcp__kanban__";

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json | null =>
    value !== null && typeof value === "object" ? (value as Json) : null;

const text = (value: unknown): string =>
    typeof value === "string" ? value : "";

function clip(value: string, max: number): string {
    const flat = value.replace(WHITESPACE, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function relativeTo(worktreeDir: string, file: string): string {
    if (file === "") {
        return "";
    }
    const relative = path.relative(worktreeDir, file);
    return relative.startsWith("..") ? file : relative;
}

function kanbanDetail(name: string, input: Json): string {
    if (name === "complete_stage") {
        return text(input.outcome);
    }
    if (name === "ask") {
        const count = Array.isArray(input.questions)
            ? input.questions.length
            : 0;
        return `${count} pergunta(s)`;
    }
    if (name === "attach_artifact") {
        return text(input.path);
    }
    return "";
}

function toolDetail(name: string, input: Json, worktreeDir: string): string {
    if (name.startsWith(KANBAN_PREFIX)) {
        return kanbanDetail(name.slice(KANBAN_PREFIX.length), input);
    }
    switch (name) {
        case "Bash":
            return text(input.description) || text(input.command);
        case "Read":
        case "Edit":
        case "Write":
        case "NotebookEdit":
            return relativeTo(
                worktreeDir,
                text(input.file_path) || text(input.notebook_path)
            );
        case "Glob":
        case "Grep":
            return text(input.pattern);
        case "Agent":
        case "Task":
            return [text(input.subagent_type), text(input.description)]
                .filter((part) => part !== "")
                .join(": ");
        case "Skill":
            return text(input.skill);
        case "ToolSearch":
        case "WebSearch":
            return text(input.query);
        case "WebFetch":
            return text(input.url);
        default:
            return "";
    }
}

function firstLine(content: unknown): string {
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content.map((block) => text(asRecord(block)?.text)).join(" ");
    }
    return "";
}

type ActivityState = {
    worktreeDir: string;
    toolNames: Map<string, string>;
    denied: Set<string>;
};

function contentOf(record: Json): unknown[] {
    const content = asRecord(record.message)?.content;
    return Array.isArray(content) ? content : [];
}

function assistantLines(record: Json, state: ActivityState): string[] {
    const nested = record.parent_tool_use_id != null;
    const indent = nested ? "      ↳ " : "  · ";
    const lines: string[] = [];
    for (const block of contentOf(record)) {
        const item = asRecord(block);
        if (item?.type === "tool_use") {
            const name = text(item.name);
            state.toolNames.set(text(item.id), name);
            const detail = clip(
                toolDetail(name, asRecord(item.input) ?? {}, state.worktreeDir),
                MAX_DETAIL
            );
            lines.push(`${indent}${name}${detail ? `  ${detail}` : ""}`);
        } else if (item?.type === "text" && !nested) {
            const said = clip(text(item.text), MAX_TEXT);
            if (said !== "") {
                lines.push(`  » ${said}`);
            }
        }
    }
    return lines;
}

function toolErrors(record: Json, state: ActivityState): string[] {
    return contentOf(record)
        .map(asRecord)
        .filter(
            (item): item is Json =>
                item?.type === "tool_result" &&
                item.is_error === true &&
                !state.denied.has(text(item.tool_use_id))
        )
        .map((item) => {
            const name = state.toolNames.get(text(item.tool_use_id)) ?? "?";
            return `  ✗ ${name} falhou: ${clip(firstLine(item.content), MAX_TEXT)}`;
        });
}

function systemLines(record: Json, state: ActivityState): string[] {
    if (record.subtype === "init") {
        return [
            `  sessão ${text(record.session_id)} · modelo ${text(record.model)} · permissão ${text(record.permissionMode)}`,
        ];
    }
    if (record.subtype === "permission_denied") {
        state.denied.add(text(record.tool_use_id));
        return [`  ✗ permissão negada: ${text(record.tool_name)}`];
    }
    return [];
}

function parse(line: string): Json | null {
    try {
        return asRecord(JSON.parse(line));
    } catch {
        return null;
    }
}

/**
 * Turns the session's stream-json into lines a person can follow in the runner's terminal:
 * which tool ran and on what, what the subagents are doing, permission denials and tool errors.
 * The full stream stays in the run's log file; this is the readable trail.
 */
export function createActivityLog(worktreeDir: string) {
    const state: ActivityState = {
        worktreeDir,
        toolNames: new Map(),
        denied: new Set(),
    };
    return {
        describe(line: string): string[] {
            const record = parse(line);
            switch (record?.type) {
                case "assistant":
                    return assistantLines(record, state);
                case "user":
                    return toolErrors(record, state);
                case "system":
                    return systemLines(record, state);
                case "result":
                    return record.subtype === "success"
                        ? []
                        : [`  ✗ sessão terminou com ${text(record.subtype)}`];
                default:
                    return [];
            }
        },
    };
}
