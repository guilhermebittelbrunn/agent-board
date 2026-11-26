export type StreamEvent =
    | { kind: "init"; sessionId: string }
    | { kind: "assistant"; messageId: string | null; tools: string[] }
    | { kind: "result"; costUsd: number | null; maxTurnsReached: boolean }
    | { kind: "other" };

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;

function toolNames(message: Record<string, unknown> | null): string[] {
    const content = Array.isArray(message?.content) ? message.content : [];
    return content
        .map(asRecord)
        .filter((block) => block?.type === "tool_use")
        .map((block) => String(block?.name ?? ""));
}

/**
 * One line of `claude -p --output-format stream-json`. Only the main session counts:
 * subagents report with a `parent_tool_use_id`, and the CLI does not count them in its own
 * turn limit either. A line that is not JSON is ignored.
 */
export function readStreamLine(line: string): StreamEvent | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(line);
    } catch {
        return null;
    }
    const record = asRecord(parsed);
    if (record === null) {
        return null;
    }
    if (record.type === "system" && record.subtype === "init") {
        return typeof record.session_id === "string"
            ? { kind: "init", sessionId: record.session_id }
            : { kind: "other" };
    }
    if (record.type === "assistant" && record.parent_tool_use_id == null) {
        const message = asRecord(record.message);
        return {
            kind: "assistant",
            messageId: typeof message?.id === "string" ? message.id : null,
            tools: toolNames(message),
        };
    }
    if (record.type === "result") {
        return {
            kind: "result",
            costUsd:
                typeof record.total_cost_usd === "number"
                    ? record.total_cost_usd
                    : null,
            maxTurnsReached: record.subtype === "error_max_turns",
        };
    }
    return { kind: "other" };
}

export type TurnCounter = {
    observe(line: string): StreamEvent | null;
    readonly turns: number;
    readonly sessionId: string | null;
};

/**
 * Counts turns of the main session. The CLI may split one assistant message into several
 * lines (one per content block) with the same message id, so ids are counted once.
 */
export function createTurnCounter(): TurnCounter {
    const seen = new Set<string>();
    let anonymous = 0;
    let sessionId: string | null = null;
    return {
        observe(line) {
            const event = readStreamLine(line);
            if (event?.kind === "init") {
                sessionId = event.sessionId;
            }
            if (event?.kind === "assistant") {
                if (event.messageId === null) {
                    anonymous += 1;
                } else {
                    seen.add(event.messageId);
                }
            }
            return event;
        },
        get turns() {
            return seen.size + anonymous;
        },
        get sessionId() {
            return sessionId;
        },
    };
}
