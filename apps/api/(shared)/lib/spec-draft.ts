import {
    ATTACHMENT_MAX_BYTES,
    type BoardConfig,
    canApproveSpec,
    isAttachmentType,
    isValidSlug,
    type RunPerson,
    resolveBranchName,
    SPEC_STAGE_KEY,
    specDraftPath,
} from "@repo/kanban-contract";
import {
    firstHeading,
    parseSpecFrontmatter,
} from "@repo/kanban-contract/spec-frontmatter";
import type { BoardDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import {
    type CardAttachmentRecord,
    type CardRecord,
    cardIdFor,
} from "@/(shared)/mappers/card.mapper";
import { cardRepository } from "@/(shared)/repositories/card.repository";
import { cleanAttachmentName } from "./attachment-name";
import { RESERVED_CARD_SLUGS } from "./card-sync";
import type { GithubClient, GithubFile } from "./github/github-client";
import {
    isAttachmentObjectPath,
    isOwnedBy,
    isStorageConfigured,
    objectIdOf,
    readObjectMetadata,
} from "./storage";

const SLUG_WORDS = 5;
const SLUG_MAX = 48;
const FALLBACK_SLUG = "spec";
const LAST_SUFFIX = 9;
const TITLE_MAX = 140;

const extensionOf = (path: string): string =>
    path.slice(path.lastIndexOf(".") + 1);

export type DraftRefusal = { ok: false; code: string; status: number };

const refuse = (code: string, status: number): DraftRefusal => ({
    ok: false,
    code,
    status,
});

/** The first words of the request, without accents or punctuation, in kebab-case. */
export function slugFromRequest(text: string): string {
    const words = text
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(" ")
        .filter((word) => word.length > 0)
        .slice(0, SLUG_WORDS);

    let slug = "";
    for (const word of words) {
        const next = slug === "" ? word : `${slug}-${word}`;
        if (next.length > SLUG_MAX) {
            break;
        }
        slug = next;
    }
    if (slug === "" && words[0] !== undefined) {
        slug = words[0].slice(0, SLUG_MAX);
    }
    return slug === "" ? FALLBACK_SLUG : slug;
}

/** The request's first non-empty line, as the card title until the spec gives a better one. */
export function titleFromRequest(text: string): string {
    const line =
        text
            .split("\n")
            .map((candidate) => candidate.trim())
            .find((candidate) => candidate.length > 0) ?? text.trim();
    return line.length > TITLE_MAX
        ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`
        : line;
}

export function slugCandidates(base: string): string[] {
    const candidates = [base];
    for (let suffix = 2; suffix <= LAST_SUFFIX; suffix += 1) {
        candidates.push(`${base}-${suffix}`);
    }
    return candidates;
}

function branchOrNull(config: BoardConfig, slug: string): string | null {
    try {
        return resolveBranchName(config, slug);
    } catch {
        return null;
    }
}

/**
 * A slug is free when no card document holds it (a discarded draft included, since its
 * branch may still exist), it is not a route name, it gives a safe branch, and no spec with
 * that slug is already on the base branch. GitHub errors propagate to the caller.
 */
export async function isDraftSlugFree(input: {
    board: Pick<BoardDTO, "id" | "config" | "repository">;
    slug: string;
    github: GithubClient;
}): Promise<boolean> {
    const { board, slug } = input;
    if (
        !isValidSlug(slug) ||
        RESERVED_CARD_SLUGS.has(slug) ||
        branchOrNull(board.config, slug) === null
    ) {
        return false;
    }
    if (await cardRepository.isIdTaken(cardIdFor(board.id, slug))) {
        return false;
    }
    const existing = await input.github.readFile(
        board.repository,
        specDraftPath(board.config, slug),
        board.config.baseBranch
    );
    return existing === null;
}

/**
 * Checks each attachment the client named: the path has the upload shape, belongs to the
 * person asking and exists in the bucket. Type and size come from the stored object.
 */
export async function resolveDraftAttachments(
    items: { path: string; name: string }[],
    ownerId: string
): Promise<{ ok: true; value: CardAttachmentRecord[] } | DraftRefusal> {
    if (items.length === 0) {
        return { ok: true, value: [] };
    }
    if (!isStorageConfigured()) {
        return refuse(
            "STORAGE_NOT_CONFIGURED",
            HTTP_STATUS.SERVICE_UNAVAILABLE
        );
    }
    const paths = new Set(items.map((item) => item.path));
    const invalid = refuse(
        "SPEC_DRAFT_ATTACHMENT_INVALID",
        HTTP_STATUS.UNPROCESSABLE_ENTITY
    );
    if (
        paths.size !== items.length ||
        items.some(
            (item) =>
                !(
                    isAttachmentObjectPath(item.path) &&
                    isOwnedBy(item.path, ownerId)
                )
        )
    ) {
        return invalid;
    }

    let metadata: Awaited<ReturnType<typeof readObjectMetadata>>[];
    try {
        metadata = await Promise.all(
            items.map((item) => readObjectMetadata(item.path))
        );
    } catch {
        return refuse("UPLOAD_FAILED", HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    const attachments: CardAttachmentRecord[] = [];
    for (const [index, item] of items.entries()) {
        const stored = metadata[index];
        if (
            !(stored && isAttachmentType(stored.contentType)) ||
            stored.size > ATTACHMENT_MAX_BYTES
        ) {
            return invalid;
        }
        attachments.push({
            id: objectIdOf(item.path),
            name: cleanAttachmentName(item.name, extensionOf(item.path)),
            contentType: stored.contentType,
            size: stored.size,
            path: item.path,
        });
    }
    return { ok: true, value: attachments };
}

export function newDraftDocument(input: {
    boardId: string;
    slug: string;
    branch: string;
    config: BoardConfig;
    text: string;
    attachments: CardAttachmentRecord[];
    by: RunPerson;
    now: Date;
}): Record<string, unknown> {
    const { now } = input;
    return {
        boardId: input.boardId,
        slug: input.slug,
        title: titleFromRequest(input.text),
        spec: {
            path: specDraftPath(input.config, input.slug),
            sha: "",
            status: "",
            ref: input.branch,
        },
        ready: false,
        orphan: false,
        origin: "board",
        lane: "drafts",
        stageKey: SPEC_STAGE_KEY,
        state: "idle",
        pendingAsk: null,
        reworkLoops: 0,
        order: 0,
        branch: input.branch,
        activeRunId: null,
        lastRun: null,
        request: {
            text: input.text,
            attachments: input.attachments,
            requestedBy: { userId: input.by.userId, login: input.by.login },
            requestedAt: now,
        },
        specApproval: null,
        movedAt: null,
        movedByUserId: null,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

/**
 * Creates the draft card under the first free slug of the request. Two requests that pick
 * the same slug at once are told apart by the create transaction: the loser tries the next.
 */
export async function createSpecDraft(input: {
    board: Pick<BoardDTO, "id" | "config" | "repository">;
    text: string;
    attachments: CardAttachmentRecord[];
    by: RunPerson;
    github: GithubClient;
    now?: Date;
}): Promise<{ ok: true; card: CardRecord } | DraftRefusal> {
    const { board } = input;
    const now = input.now ?? new Date();
    for (const slug of slugCandidates(slugFromRequest(input.text))) {
        if (!(await isDraftSlugFree({ board, slug, github: input.github }))) {
            continue;
        }
        const branch = resolveBranchName(board.config, slug);
        const card = await cardRepository.createDraft(
            cardIdFor(board.id, slug),
            newDraftDocument({
                boardId: board.id,
                slug,
                branch,
                config: board.config,
                text: input.text,
                attachments: input.attachments,
                by: input.by,
                now,
            })
        );
        if (card !== null) {
            return { ok: true, card };
        }
    }
    return refuse("SPEC_DRAFT_SLUG_UNAVAILABLE", HTTP_STATUS.CONFLICT);
}

/** Whether the card may be approved now, before reading the spec from GitHub. */
export function checkDraftApprovable(card: CardRecord): DraftRefusal | null {
    if (card.lane !== "drafts") {
        return refuse("CARD_NOT_DRAFT", HTTP_STATUS.CONFLICT);
    }
    if (!canApproveSpec(card)) {
        return refuse("CARD_SPEC_NOT_READY", HTTP_STATUS.CONFLICT);
    }
    return null;
}

/**
 * What approving writes: the draft joins the end of Tasks as a ready card, its spec still
 * on the card branch. The repository is read-only for the board, so the approval is kept
 * on the card and the file keeps the status the agent wrote.
 */
export function planSpecApproval(input: {
    card: CardRecord;
    file: GithubFile | null;
    config: BoardConfig;
    by: RunPerson;
    order: number;
    now: Date;
}): { ok: true; patch: Record<string, unknown> } | DraftRefusal {
    const { card, file, config, by, now } = input;
    if (file === null) {
        return refuse(
            "CARD_SPEC_DRAFT_MISSING",
            HTTP_STATUS.UNPROCESSABLE_ENTITY
        );
    }
    const parsed = parseSpecFrontmatter(file.content);
    if (!parsed?.ok || parsed.spec.id !== card.slug) {
        return refuse(
            "CARD_SPEC_DRAFT_INVALID",
            HTTP_STATUS.UNPROCESSABLE_ENTITY
        );
    }
    return {
        ok: true,
        patch: {
            lane: "tasks",
            stageKey: null,
            state: "idle",
            ready: true,
            order: input.order,
            title:
                parsed.spec.title ?? firstHeading(file.content) ?? card.title,
            spec: {
                path: card.spec.path,
                sha: file.sha,
                status: config.backlog.readyStatus,
                ref: card.branch,
            },
            specApproval: { userId: by.userId, login: by.login, at: now },
            movedAt: now,
            movedByUserId: by.userId,
            updatedAt: now,
        },
    };
}
