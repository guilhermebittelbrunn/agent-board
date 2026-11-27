import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getFirestoreAdmin } = await import("@repo/auth/server");
const { credentialRepository } = await import(
    "@/(shared)/repositories/credential.repository"
);
const { credentialIdOf } = await import("@/(shared)/mappers/credential.mapper");
const { openSecret } = await import("@/(shared)/lib/credentials/secret-box");

const BOARD_ID = `emu-credential-${randomUUID()}`;
const KEY_BYTES = 32;
const KEY = Buffer.alloc(KEY_BYTES, "k");
const FIRST_SAVE = new Date("2026-11-27T05:00:00.000Z");
const SECOND_SAVE = new Date("2026-11-27T06:00:00.000Z");
const FIRE_URL =
    "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGH/fire";

const db = () => getFirestoreAdmin();
const owner = (userId: string, stageKey = "analyze") => ({
    boardId: BOARD_ID,
    userId,
    stageKey,
});

afterAll(async () => {
    const snapshot = await db()
        .collection("credential")
        .where("boardId", "==", BOARD_ID)
        .get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
});

describe("credentialRepository against the emulator", () => {
    it("seals per document, keeps createdAt on a replace and lists only the person's", async () => {
        await credentialRepository.saveScheduledTask({
            ...owner("u1"),
            task: { fireUrl: FIRE_URL, token: "first-token-0123456789-AAAA" },
            key: KEY,
            now: FIRST_SAVE,
        });
        const replaced = await credentialRepository.saveScheduledTask({
            ...owner("u1"),
            task: { fireUrl: FIRE_URL, token: "second-token-0123456789-BBBB" },
            key: KEY,
            now: SECOND_SAVE,
        });
        await credentialRepository.saveScheduledTask({
            ...owner("u2"),
            task: { fireUrl: FIRE_URL, token: "other-token-0123456789-CCCC" },
            key: KEY,
            now: FIRST_SAVE,
        });

        expect(replaced).toMatchObject({
            triggerIdLast4: "EFGH",
            tokenLast4: "BBBB",
            createdAt: FIRST_SAVE.toISOString(),
            updatedAt: SECOND_SAVE.toISOString(),
        });
        const listed = await credentialRepository.listOwned(BOARD_ID, "u1");
        expect(listed.map((credential) => credential.userId)).toEqual(["u1"]);
        expect(listed[0]).not.toHaveProperty("sealed");

        const sealed = await credentialRepository.findSealed(owner("u1"));
        expect(sealed).not.toContain("second-token");
        expect(
            openSecret(KEY, String(sealed), credentialIdOf(owner("u1")))
        ).toBe(
            JSON.stringify({
                fireUrl: FIRE_URL,
                token: "second-token-0123456789-BBBB",
            })
        );
        expect(
            openSecret(KEY, String(sealed), credentialIdOf(owner("u2")))
        ).toBeNull();
    });

    it("removes only a live credential of the person and wipes the sealed value", async () => {
        await credentialRepository.saveScheduledTask({
            ...owner("u3", "review"),
            task: { fireUrl: FIRE_URL, token: "third-token-0123456789-DDDD" },
            key: KEY,
            now: FIRST_SAVE,
        });

        expect(
            await credentialRepository.removeOwned(
                owner("u4", "review"),
                SECOND_SAVE
            )
        ).toBe(false);
        expect(
            await credentialRepository.removeOwned(
                owner("u3", "review"),
                SECOND_SAVE
            )
        ).toBe(true);
        expect(
            await credentialRepository.removeOwned(
                owner("u3", "review"),
                SECOND_SAVE
            )
        ).toBe(false);

        const stored = (
            await db()
                .collection("credential")
                .doc(credentialIdOf(owner("u3", "review")))
                .get()
        ).data();
        expect(stored?.sealed).toBeNull();
        expect(stored?.deletedAt).not.toBeNull();
        expect(await credentialRepository.listOwned(BOARD_ID, "u3")).toEqual(
            []
        );
        expect(
            await credentialRepository.findSealed(owner("u3", "review"))
        ).toBeNull();
    });
});
