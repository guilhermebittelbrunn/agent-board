import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getFirestoreAdmin } = await import("@repo/auth/server");
const { cardRepository } = await import(
    "@/(shared)/repositories/card.repository"
);

const BOARD_ID = `emu-draft-${randomUUID()}`;
const AT = new Date("2026-11-27T09:00:00.000Z");
let draftCount = 0;

const db = () => getFirestoreAdmin();

const draftDocument = (
    slug: string,
    overrides: Record<string, unknown> = {}
) => ({
    boardId: BOARD_ID,
    slug,
    title: slug,
    spec: { path: `specs/features/${slug}.md`, sha: null, status: "proposed" },
    ready: false,
    orphan: false,
    lane: "drafts",
    origin: "board",
    request: {
        text: "Quero um aviso no Slack",
        attachments: [],
        requestedBy: { userId: "p-owner", login: "octo" },
        requestedAt: AT,
    },
    specApproval: null,
    stageKey: "spec",
    state: "idle",
    pendingAsk: null,
    activeRunId: null,
    lastRun: {
        id: "run-1",
        stageKey: "spec",
        status: "finished",
        outcome: "success",
        endReason: null,
        stoppedByLogin: null,
        finishedAt: AT,
    },
    reworkLoops: 0,
    order: 0,
    branch: `feat/${slug}`,
    movedAt: null,
    movedByUserId: null,
    syncedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
});

const nextSlug = () => {
    draftCount += 1;
    return `draft-${draftCount}`;
};

async function seedDraft(overrides: Record<string, unknown> = {}) {
    const slug = nextSlug();
    const id = `${BOARD_ID}__${slug}`;
    await db().collection("card").doc(id).set(draftDocument(slug, overrides));
    return id;
}

const approvalPatch = { lane: "tasks", ready: true, updatedAt: AT };

afterAll(async () => {
    const snapshot = await db()
        .collection("card")
        .where("boardId", "==", BOARD_ID)
        .get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
});

describe("card repository spec drafts (emulator)", () => {
    it("lets only one of two concurrent creates of the same id through", async () => {
        const slug = nextSlug();
        const id = `${BOARD_ID}__${slug}`;

        const results = await Promise.all([
            cardRepository.createDraft(id, draftDocument(slug)),
            cardRepository.createDraft(id, draftDocument(slug)),
        ]);

        expect(results.filter((card) => card !== null)).toHaveLength(1);
        expect(results.filter((card) => card === null)).toHaveLength(1);
        expect(results.find((card) => card !== null)?.lane).toBe("drafts");
    });

    it("keeps the id of a discarded draft taken", async () => {
        const id = await seedDraft();

        expect(await cardRepository.discardDraft(id, AT)).toBeNull();
        expect(await cardRepository.isIdTaken(id)).toBe(true);
        expect(
            await cardRepository.createDraft(id, draftDocument("again"))
        ).toBeNull();
    });

    it("approves a ready draft and moves it to tasks", async () => {
        const id = await seedDraft();

        const result = await cardRepository.approveDraft(id, approvalPatch);

        expect(result.ok).toBe(true);
        const stored = (await db().collection("card").doc(id).get()).data();
        expect(stored?.lane).toBe("tasks");
        expect(stored?.ready).toBe(true);
    });

    it.each([
        ["a failed round", { state: "failed" }],
        ["a live run", { activeRunId: "run-2", state: "running" }],
        [
            "an open question",
            { pendingAsk: { eventId: "e1" }, state: "waiting_input" },
        ],
    ])(
        "refuses to approve a draft with %s and leaves it in drafts",
        async (_label, overrides) => {
            const id = await seedDraft(overrides);

            const result = await cardRepository.approveDraft(id, approvalPatch);

            expect(result).toEqual({ ok: false, code: "CARD_SPEC_NOT_READY" });
            const stored = (await db().collection("card").doc(id).get()).data();
            expect(stored?.lane).toBe("drafts");
        }
    );

    it("refuses to approve or discard a card outside drafts", async () => {
        const id = await seedDraft({ lane: "tasks", stageKey: null });

        expect(await cardRepository.approveDraft(id, approvalPatch)).toEqual({
            ok: false,
            code: "CARD_NOT_DRAFT",
        });
        expect(await cardRepository.discardDraft(id, AT)).toBe(
            "CARD_NOT_DRAFT"
        );
    });

    it("refuses to discard a draft while its run is live", async () => {
        const id = await seedDraft({ activeRunId: "run-3", state: "running" });

        expect(await cardRepository.discardDraft(id, AT)).toBe(
            "CARD_RUN_ACTIVE"
        );
        const stored = (await db().collection("card").doc(id).get()).data();
        expect(stored?.deletedAt).toBeNull();
    });

    it("answers not found for a draft already discarded", async () => {
        const id = await seedDraft({ deletedAt: AT });

        expect(await cardRepository.discardDraft(id, AT)).toBe(
            "CARD_NOT_FOUND"
        );
        expect(await cardRepository.approveDraft(id, approvalPatch)).toEqual({
            ok: false,
            code: "CARD_NOT_FOUND",
        });
    });
});
