import { parseDocument } from "yaml";

export type SpecFrontmatter = {
    id: string;
    title: string | null;
    status: string;
};

/**
 * `null`: the file does not open with a frontmatter block, so it is not a spec (a README,
 * a doc the index links to). `{ ok: false }`: the block exists but is not readable or
 * misses `id` or `status`.
 */
export type SpecFrontmatterResult =
    | null
    | { ok: false }
    | { ok: true; spec: SpecFrontmatter };

const OPENING = /^﻿?---[ \t]*\r?\n/;
const CLOSING = /^---[ \t]*$/m;
const HEADING = /^#[ \t]+(.+?)[ \t#]*$/m;

const textOf = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

function splitFrontmatter(
    text: string
): { block: string; body: string } | null {
    const opening = OPENING.exec(text);
    if (!opening) {
        return null;
    }
    const rest = text.slice(opening[0].length);
    const closing = CLOSING.exec(rest);
    if (!closing) {
        return { block: rest, body: "" };
    }
    return {
        block: rest.slice(0, closing.index),
        body: rest.slice(closing.index + closing[0].length),
    };
}

/**
 * Reads the frontmatter of a spec as data only: unknown tags (only a warning for the
 * `yaml` package) and duplicated keys are refused, and the alias budget of the package
 * stops a block that expands into a huge object.
 */
export function parseSpecFrontmatter(text: string): SpecFrontmatterResult {
    const parts = splitFrontmatter(text);
    if (!parts) {
        return null;
    }

    const document = parseDocument(parts.block, {
        prettyErrors: false,
        uniqueKeys: true,
    });
    if (document.errors.length > 0 || document.warnings.length > 0) {
        return { ok: false };
    }

    let raw: unknown;
    try {
        raw = document.toJS();
    } catch {
        return { ok: false };
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false };
    }

    const record = raw as Record<string, unknown>;
    const id = textOf(record.id);
    const status = textOf(record.status);
    if (!(id && status)) {
        return { ok: false };
    }
    return { ok: true, spec: { id, title: textOf(record.title), status } };
}

/** The text of the first `# ` heading after the frontmatter, the fallback for a spec title. */
export function firstHeading(text: string): string | null {
    const body = splitFrontmatter(text)?.body ?? text;
    return textOf(HEADING.exec(body)?.[1]);
}

/** The markdown after the frontmatter block, or the whole text when the file has none. */
export function specBody(text: string): string {
    return splitFrontmatter(text)?.body ?? text;
}
