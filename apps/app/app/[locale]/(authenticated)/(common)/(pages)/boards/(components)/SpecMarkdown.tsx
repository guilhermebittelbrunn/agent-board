import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { cn } from "@repo/design-system/lib/utils";
import { getDictionary } from "@repo/internationalization/client";
import { folderOf, resolveRepoPath } from "@repo/kanban-contract";
import { marked, type Token, type Tokens } from "marked";
import type { ReactNode } from "react";
import { fillMessage } from "./boardConfigIssueMessage";
import { githubFileUrl } from "./githubFileUrl";

/** Where relative links of the document point: the file's folder, on this ref of the repository. */
export type SpecLinkBase = {
    owner: string;
    name: string;
    ref: string;
    /** Path of the document in the repository; `""` resolves links from the root. */
    documentPath: string;
};

type SpecMarkdownProps = {
    content: string;
    links: SpecLinkBase;
    className?: string;
};

type RenderContext = {
    links: SpecLinkBase;
    imageLabel: (alt: string) => string;
    taskLabel: (checked: boolean) => string;
};

const HTTP_LINK = /^https?:\/\//i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// The lexer hands text over already HTML-escaped. React escapes it again, so the five
// entities `marked` produces are decoded first or the reader would see `&amp;`.
const ENTITIES: [RegExp, string][] = [
    [/&lt;/g, "<"],
    [/&gt;/g, ">"],
    [/&quot;/g, '"'],
    [/&#39;/g, "'"],
    [/&amp;/g, "&"],
];

export function decodeMarkedText(text: string): string {
    let decoded = text;
    for (const [entity, character] of ENTITIES) {
        decoded = decoded.replace(entity, character);
    }
    return decoded;
}

/** Only web links and paths inside the repository become links; any other scheme stays text. */
export function resolveSpecHref(
    href: string,
    links: SpecLinkBase
): string | null {
    const target = href.trim();
    if (HTTP_LINK.test(target)) {
        return target;
    }
    if (
        target === "" ||
        target.startsWith("#") ||
        target.startsWith("//") ||
        HAS_SCHEME.test(target)
    ) {
        return null;
    }
    const [path = "", anchor] = target.split("#", 2);
    const resolved = resolveRepoPath(folderOf(links.documentPath), path);
    if (resolved === null) {
        return null;
    }
    const url = githubFileUrl(links.owner, links.name, links.ref, resolved);
    return anchor ? `${url}#${encodeURIComponent(anchor)}` : url;
}

const MAX_HEADING_LEVEL = 6;

const HEADING_CLASS: Record<number, string> = {
    2: "font-semibold text-xl",
    3: "font-semibold text-lg",
    4: "font-semibold text-base",
    5: "font-semibold text-sm",
    6: "font-semibold text-muted-foreground text-sm",
};

function renderInline(
    tokens: Token[] | undefined,
    ctx: RenderContext
): ReactNode {
    return (tokens ?? []).map((token, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens have no id and never reorder
        <InlineToken ctx={ctx} key={index} token={token} />
    ));
}

function InlineToken({ token, ctx }: { token: Token; ctx: RenderContext }) {
    switch (token.type) {
        case "strong":
            return <strong>{renderInline(token.tokens, ctx)}</strong>;
        case "em":
            return <em>{renderInline(token.tokens, ctx)}</em>;
        case "del":
            return <del>{renderInline(token.tokens, ctx)}</del>;
        case "codespan":
            return (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
                    {decodeMarkedText(token.text)}
                </code>
            );
        case "br":
            return <br />;
        case "link": {
            const link = token as Tokens.Link;
            const href = resolveSpecHref(link.href, ctx.links);
            const children = renderInline(link.tokens, ctx);
            if (href === null) {
                return <span>{children}</span>;
            }
            return (
                <a
                    className="text-primary underline underline-offset-4"
                    href={href}
                    rel="noreferrer noopener"
                    target="_blank"
                >
                    {children}
                </a>
            );
        }
        case "image": {
            const image = token as Tokens.Image;
            const href = resolveSpecHref(image.href, ctx.links);
            const label = ctx.imageLabel(decodeMarkedText(image.text));
            if (href === null) {
                return <span>{label}</span>;
            }
            return (
                <a
                    className="text-primary underline underline-offset-4"
                    href={href}
                    rel="noreferrer noopener"
                    target="_blank"
                >
                    {label}
                </a>
            );
        }
        case "html":
            return <span>{token.raw}</span>;
        case "text":
        case "escape":
            return "tokens" in token && token.tokens
                ? renderInline(token.tokens, ctx)
                : decodeMarkedText(token.text);
        default:
            return token.raw;
    }
}

function ListBlock({ list, ctx }: { list: Tokens.List; ctx: RenderContext }) {
    const items = list.items.map((item, index) => (
        <li
            className={cn(item.task && "flex list-none items-start gap-2")}
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no id and never reorder
            key={index}
        >
            {item.task ? (
                <Checkbox
                    aria-label={ctx.taskLabel(item.checked === true)}
                    checked={item.checked === true}
                    className="mt-1"
                    disabled
                />
            ) : null}
            <div className="min-w-0">{renderBlocks(item.tokens, ctx)}</div>
        </li>
    ));
    return list.ordered ? (
        <ol
            className="flex list-decimal flex-col gap-1 pl-6"
            start={typeof list.start === "number" ? list.start : undefined}
        >
            {items}
        </ol>
    ) : (
        <ul className="flex list-disc flex-col gap-1 pl-6">{items}</ul>
    );
}

function TableBlock({
    table,
    ctx,
}: {
    table: Tokens.Table;
    ctx: RenderContext;
}) {
    const alignOf = (index: number) => table.align[index] ?? undefined;
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr>
                        {table.header.map((cell, index) => (
                            <th
                                className="border border-border bg-muted px-3 py-2 text-left font-semibold"
                                // biome-ignore lint/suspicious/noArrayIndexKey: cells have no id and never reorder
                                key={index}
                                style={{ textAlign: alignOf(index) }}
                            >
                                {renderInline(cell.tokens, ctx)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {table.rows.map((row, rowIndex) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id and never reorder
                        <tr key={rowIndex}>
                            {row.map((cell, index) => (
                                <td
                                    className="border border-border px-3 py-2"
                                    // biome-ignore lint/suspicious/noArrayIndexKey: cells have no id and never reorder
                                    key={index}
                                    style={{ textAlign: alignOf(index) }}
                                >
                                    {renderInline(cell.tokens, ctx)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function BlockToken({ token, ctx }: { token: Token; ctx: RenderContext }) {
    switch (token.type) {
        case "space":
        case "def":
            return null;
        case "heading": {
            const heading = token as Tokens.Heading;
            // The page title is the only h1, so the spec's own headings start one level below.
            const level = Math.min(heading.depth + 1, MAX_HEADING_LEVEL);
            const Tag = `h${level}` as "h2";
            return (
                <Tag className={HEADING_CLASS[level]}>
                    {renderInline(heading.tokens, ctx)}
                </Tag>
            );
        }
        case "paragraph":
            return <p>{renderInline(token.tokens, ctx)}</p>;
        case "text":
            return (
                <p>
                    {renderInline(
                        "tokens" in token ? token.tokens : [token],
                        ctx
                    )}
                </p>
            );
        case "list":
            return <ListBlock ctx={ctx} list={token as Tokens.List} />;
        case "code":
            return (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
                    <code>{token.text}</code>
                </pre>
            );
        case "blockquote":
            return (
                <blockquote className="flex flex-col gap-2 border-border border-l-4 pl-4 text-muted-foreground">
                    {renderBlocks(token.tokens, ctx)}
                </blockquote>
            );
        case "table":
            return <TableBlock ctx={ctx} table={token as Tokens.Table} />;
        case "hr":
            return <hr className="border-border" />;
        case "html":
            return (
                <p className="whitespace-pre-wrap font-mono text-muted-foreground text-sm">
                    {token.raw}
                </p>
            );
        default:
            return <p className="whitespace-pre-wrap">{token.raw}</p>;
    }
}

function renderBlocks(
    tokens: Token[] | undefined,
    ctx: RenderContext
): ReactNode {
    return (tokens ?? []).map((token, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens have no id and never reorder
        <BlockToken ctx={ctx} key={index} token={token} />
    ));
}

/**
 * Draws a markdown document from someone else's repository. Only the lexer of `marked`
 * runs; every token becomes a React element, so raw HTML shows as text and no string
 * reaches the DOM as markup.
 */
export function SpecMarkdown({ content, links, className }: SpecMarkdownProps) {
    const { dictionary } = getDictionary();
    const detailCopy = dictionary.apps.app.pages.common.boards.cardDetail;
    const ctx: RenderContext = {
        links,
        imageLabel: (alt) =>
            alt
                ? fillMessage(detailCopy.imageLink, { alt })
                : detailCopy.imageLinkNoAlt,
        taskLabel: (checked) =>
            checked ? detailCopy.taskDone : detailCopy.taskOpen,
    };
    const tokens = marked.lexer(content, { gfm: true });

    return (
        <div
            className={cn("flex min-w-0 flex-col gap-4 break-words", className)}
        >
            {renderBlocks(tokens, ctx)}
        </div>
    );
}
