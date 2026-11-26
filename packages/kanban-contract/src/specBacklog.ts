const MARKDOWN_LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const MARKDOWN_FILE = /\.md$/i;
const ANCHOR_OR_QUERY = /[#?]/;

/** Joins `path` to the folder `base`, or `null` when it climbs above the repository root. */
export function resolveRepoPath(base: string, path: string): string | null {
    const segments = path.startsWith("/")
        ? []
        : base.split("/").filter((segment) => segment.length > 0);
    for (const segment of path.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }
        if (segment === "..") {
            if (segments.length === 0) {
                return null;
            }
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    return segments.length > 0 ? segments.join("/") : null;
}

export const folderOf = (path: string): string => {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
};

function safeDecode(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

/**
 * The relative `.md` links of a backlog index, resolved from the index's folder, in the
 * order they first appear. External links, anchors and paths that leave the repository
 * are dropped: the index is read from someone else's repository and only points inside it.
 */
export function extractBacklogLinks(
    markdown: string,
    indexPath: string
): string[] {
    const base = folderOf(indexPath);
    const found: string[] = [];
    const seen = new Set<string>();

    for (const match of markdown.matchAll(MARKDOWN_LINK)) {
        const target = match[1] ?? "";
        if (HAS_SCHEME.test(target) || target.startsWith("#")) {
            continue;
        }
        const withoutAnchor = target.split(ANCHOR_OR_QUERY, 1)[0] ?? "";
        const decoded = safeDecode(withoutAnchor);
        if (!(decoded && MARKDOWN_FILE.test(decoded))) {
            continue;
        }
        const resolved = resolveRepoPath(base, decoded);
        if (resolved === null || resolved === indexPath || seen.has(resolved)) {
            continue;
        }
        seen.add(resolved);
        found.push(resolved);
    }
    return found;
}
