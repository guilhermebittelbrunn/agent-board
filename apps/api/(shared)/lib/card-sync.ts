import {
    type BoardConfig,
    extractBacklogLinks,
    isCardReady,
    isValidSlug,
    resolveBranchName,
} from "@repo/kanban-contract";
import {
    firstHeading,
    parseSpecFrontmatter,
} from "@repo/kanban-contract/spec-frontmatter";
import type { BoardDTO, CardSyncSkipDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { type CardRecord, cardIdFor } from "@/(shared)/mappers/card.mapper";
import type { CardSyncWrite } from "@/(shared)/repositories/card.repository";
import { nextTasksOrder } from "./card-order";
import type { GithubClient } from "./github/github-client";
import { githubErrorResponse } from "./github/github-errors";
import { mapWithConcurrency } from "./map-with-concurrency";

/** Bounds the GitHub reads of one sync: the index plus at most this many files. */
export const BACKLOG_SYNC_MAX_FILES = 200;
const SPEC_READ_CONCURRENCY = 8;

// `cards/sync` and `cards/order` are routes next to `cards/[slug]`, so a card with one of
// these slugs could never be opened.
const RESERVED_CARD_SLUGS: ReadonlySet<string> = new Set(["sync", "order"]);

/** A spec file as read from the repository, before the slug checks of the plan. */
export type BacklogSpec = {
    path: string;
    sha: string;
    id: string;
    title: string;
    status: string;
};

export type BacklogRead =
    | { ok: false; response: Response }
    | {
          ok: true;
          specs: BacklogSpec[];
          skipped: CardSyncSkipDTO[];
          index: { path: string; sha: string; ref: string };
      };

const refuse = (code: string, status: number) => ({
    ok: false as const,
    response: Response.json({ error: { code } }, { status }),
});

type FileOutcome =
    | { kind: "spec"; spec: BacklogSpec }
    | { kind: "skipped"; skip: CardSyncSkipDTO }
    | { kind: "ignored" };

async function readSpecFile(
    client: GithubClient,
    board: BoardDTO,
    path: string
): Promise<FileOutcome> {
    const file = await client.readFile(
        board.repository,
        path,
        board.config.baseBranch
    );
    if (!file) {
        return { kind: "skipped", skip: { path, reason: "not_found" } };
    }
    const parsed = parseSpecFrontmatter(file.content);
    if (parsed === null) {
        return { kind: "ignored" };
    }
    if (!parsed.ok) {
        return {
            kind: "skipped",
            skip: { path, reason: "frontmatter_invalid" },
        };
    }
    const { id, title, status } = parsed.spec;
    return {
        kind: "spec",
        spec: {
            path,
            sha: file.sha,
            id,
            title: title ?? firstHeading(file.content) ?? id,
            status,
        },
    };
}

/**
 * Reads the backlog index on the base branch and every `.md` it links to. Files without a
 * frontmatter (READMEs, docs) are not specs and are left out silently.
 */
export async function readBacklog(
    client: GithubClient,
    board: BoardDTO
): Promise<BacklogRead> {
    const { backlog, baseBranch } = board.config;
    if (backlog.source === "manual") {
        return refuse("BOARD_BACKLOG_SOURCE_MANUAL", HTTP_STATUS.CONFLICT);
    }

    try {
        const index = await client.readFile(
            board.repository,
            backlog.index,
            baseBranch
        );
        if (!index) {
            return refuse(
                "BOARD_BACKLOG_INDEX_NOT_FOUND",
                HTTP_STATUS.UNPROCESSABLE_ENTITY
            );
        }

        const links = extractBacklogLinks(index.content, backlog.index);
        const outcomes = await mapWithConcurrency(
            links.slice(0, BACKLOG_SYNC_MAX_FILES),
            SPEC_READ_CONCURRENCY,
            (path) => readSpecFile(client, board, path)
        );

        const specs: BacklogSpec[] = [];
        const skipped: CardSyncSkipDTO[] = [];
        for (const outcome of outcomes) {
            if (outcome.kind === "spec") {
                specs.push(outcome.spec);
            } else if (outcome.kind === "skipped") {
                skipped.push(outcome.skip);
            }
        }
        for (const path of links.slice(BACKLOG_SYNC_MAX_FILES)) {
            skipped.push({ path, reason: "limit" });
        }

        return {
            ok: true,
            specs,
            skipped,
            index: { path: backlog.index, sha: index.sha, ref: baseBranch },
        };
    } catch (error) {
        const response = githubErrorResponse(error);
        if (!response) {
            throw error;
        }
        return { ok: false, response };
    }
}

/** `null` when the slug or the branch pattern cannot give a safe branch for this card. */
export function branchFor(config: BoardConfig, slug: string): string | null {
    try {
        return resolveBranchName(config, slug);
    } catch {
        return null;
    }
}

export type BacklogSyncSummary = {
    created: number;
    updated: number;
    orphaned: number;
    unchanged: number;
};

export type BacklogSyncPlan = {
    writes: CardSyncWrite[];
    summary: BacklogSyncSummary;
    skipped: CardSyncSkipDTO[];
    /** Specs accepted from the index, ready or not. */
    specCount: number;
};

type SyncedFields = Pick<
    CardRecord,
    "title" | "spec" | "ready" | "orphan" | "branch"
>;

const sameFields = (card: CardRecord, fields: SyncedFields): boolean =>
    card.title === fields.title &&
    card.spec.path === fields.spec.path &&
    card.spec.sha === fields.spec.sha &&
    card.spec.status === fields.spec.status &&
    card.ready === fields.ready &&
    card.orphan === fields.orphan &&
    card.branch === fields.branch;

type SyncInput = {
    boardId: string;
    existing: CardRecord[];
    specs: BacklogSpec[];
    config: BoardConfig;
    now: Date;
};

/** The specs the plan accepts: valid slugs, the first file of each slug. */
function acceptSpecs(specs: BacklogSpec[]): {
    accepted: BacklogSpec[];
    skipped: CardSyncSkipDTO[];
} {
    const seen = new Set<string>();
    const accepted: BacklogSpec[] = [];
    const skipped: CardSyncSkipDTO[] = [];
    for (const spec of specs) {
        if (!isValidSlug(spec.id) || RESERVED_CARD_SLUGS.has(spec.id)) {
            skipped.push({ path: spec.path, reason: "slug_invalid" });
        } else if (seen.has(spec.id)) {
            skipped.push({ path: spec.path, reason: "slug_duplicated" });
        } else {
            seen.add(spec.id);
            accepted.push(spec);
        }
    }
    return { accepted, skipped };
}

function syncedFields(
    spec: BacklogSpec,
    card: CardRecord | undefined,
    config: BoardConfig
): SyncedFields {
    const inTasks = (card?.lane ?? "tasks") === "tasks";
    return {
        title: spec.title,
        spec: { path: spec.path, sha: spec.sha, status: spec.status },
        ready: isCardReady(spec.status, config.backlog.readyStatus, false),
        orphan: false,
        branch: inTasks ? branchFor(config, spec.id) : (card?.branch ?? null),
    };
}

function newCardDocument({
    boardId,
    slug,
    fields,
    order,
    now,
}: {
    boardId: string;
    slug: string;
    fields: SyncedFields;
    order: number;
    now: Date;
}): Record<string, unknown> {
    return {
        boardId,
        slug,
        ...fields,
        lane: "tasks",
        stageKey: null,
        state: "idle",
        reworkLoops: 0,
        order,
        movedAt: null,
        movedByUserId: null,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

/**
 * What a sync writes, decided without Firestore or GitHub. New specs go to the end of
 * Tasks in index order; the order of existing cards is the board's and is never touched;
 * a card whose spec left the index turns orphan and stays. The branch only follows the
 * pattern while the card is in Tasks, so a card already started keeps its branch.
 */
export function planBacklogSync(input: SyncInput): BacklogSyncPlan {
    const { boardId, existing, config, now } = input;
    const { accepted, skipped } = acceptSpecs(input.specs);
    const bySlug = new Map(existing.map((card) => [card.slug, card]));
    const writes: CardSyncWrite[] = [];
    const summary: BacklogSyncSummary = {
        created: 0,
        updated: 0,
        orphaned: 0,
        unchanged: 0,
    };
    let nextOrder = nextTasksOrder(existing);

    for (const spec of accepted) {
        const card = bySlug.get(spec.id);
        const fields = syncedFields(spec, card, config);
        if (!card) {
            writes.push({
                kind: "create",
                id: cardIdFor(boardId, spec.id),
                document: newCardDocument({
                    boardId,
                    slug: spec.id,
                    fields,
                    order: nextOrder,
                    now,
                }),
            });
            nextOrder += 1;
            summary.created += 1;
        } else if (sameFields(card, fields)) {
            summary.unchanged += 1;
        } else {
            writes.push({
                kind: "update",
                id: card.id,
                patch: { ...fields, syncedAt: now, updatedAt: now },
            });
            summary.updated += 1;
        }
    }

    const acceptedSlugs = new Set(accepted.map((spec) => spec.id));
    for (const card of existing) {
        if (acceptedSlugs.has(card.slug)) {
            continue;
        }
        if (card.orphan) {
            summary.unchanged += 1;
            continue;
        }
        writes.push({
            kind: "update",
            id: card.id,
            patch: {
                orphan: true,
                ready: false,
                syncedAt: now,
                updatedAt: now,
            },
        });
        summary.orphaned += 1;
    }

    return { writes, summary, skipped, specCount: accepted.length };
}
