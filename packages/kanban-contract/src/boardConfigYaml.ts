import { LineCounter, parseDocument } from "yaml";
import { type BoardConfig, parseBoardConfig } from "./boardConfig";
import {
    type BoardConfigIssue,
    toBoardConfigIssues,
} from "./boardConfigIssues";

export type BoardConfigYamlResult =
    | { ok: true; config: BoardConfig }
    | {
          ok: false;
          issues: BoardConfigIssue[];
          /** The file as data when the YAML itself is readable, `null` otherwise. */
          raw: unknown | null;
      };

const isMapping = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Reads the text of a `.kanban/board.yml` as data only: no custom tags, duplicated keys
 * refused, and the default alias budget of the `yaml` package stops a file that expands
 * aliases into a huge object.
 */
export function parseBoardConfigYaml(text: string): BoardConfigYamlResult {
    const lineCounter = new LineCounter();
    const document = parseDocument(text, {
        prettyErrors: false,
        uniqueKeys: true,
        lineCounter,
    });

    if (document.errors.length > 0) {
        return {
            ok: false,
            raw: null,
            issues: document.errors.map((error) => {
                const { line, col } = lineCounter.linePos(error.pos[0]);
                return {
                    path: "",
                    rule: "yaml_syntax",
                    params: { line, column: col },
                };
            }),
        };
    }

    let raw: unknown;
    try {
        raw = document.toJS();
    } catch {
        return {
            ok: false,
            raw: null,
            issues: [{ path: "", rule: "yaml_syntax", params: {} }],
        };
    }

    if (!isMapping(raw)) {
        return {
            ok: false,
            raw: null,
            issues: [{ path: "", rule: "root_not_mapping", params: {} }],
        };
    }

    const parsed = parseBoardConfig(raw);
    if (!parsed.success) {
        return {
            ok: false,
            raw,
            issues: toBoardConfigIssues(parsed.error, raw),
        };
    }
    return { ok: true, config: parsed.data };
}
