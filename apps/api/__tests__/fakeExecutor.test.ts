import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { askInputSchema } from "@repo/kanban-contract";
import { describe, expect, it, vi } from "vitest";
import {
    claimOutcome,
    createFakeExecutor,
    FAKE_RUN_DURATION_MS,
    type FakeScript,
    toFakeScript,
} from "@/(shared)/lib/orchestrator/fake-executor";

const STARTED = new Date("2026-11-26T10:00:00.000Z");
const view = (runId: string, cardId = "b1__search-cards") => ({
    runId,
    cardId,
    slug: "search-cards",
    stageKey: "analyze",
    command: "/analyze",
    startedAt: STARTED,
});
const elapsed = (ms: number) => new Date(STARTED.getTime() + ms);

/** The script as the Firestore transaction keeps it, in memory. */
function scriptedPorts(outcomes: FakeScript["outcomes"] = []) {
    let script: FakeScript | null = outcomes.length
        ? { outcomes, claims: {} }
        : null;
    return {
        claim: vi.fn((_cardId: string, runId: string) => {
            const claimed = claimOutcome(script, runId);
            if (claimed === null) {
                return Promise.resolve(null);
            }
            script = claimed.script;
            return Promise.resolve(claimed.outcome);
        }),
        note: vi.fn(() => Promise.resolve()),
    };
}

describe("fake stage executor", () => {
    it("reports only after the fake run duration", async () => {
        const executor = createFakeExecutor(scriptedPorts());

        expect(
            await executor.collect?.(
                [view("r1")],
                elapsed(FAKE_RUN_DURATION_MS - 1)
            )
        ).toEqual([]);
        expect(
            await executor.collect?.(
                [view("r1")],
                elapsed(FAKE_RUN_DURATION_MS)
            )
        ).toMatchObject([{ runId: "r1", outcome: "success" }]);
    });

    it("consumes the script in order, one outcome per run", async () => {
        const executor = createFakeExecutor(
            scriptedPorts(["needs_rework", "failed"])
        );
        const now = elapsed(FAKE_RUN_DURATION_MS);

        expect(await executor.collect?.([view("r1")], now)).toMatchObject([
            { outcome: "needs_rework" },
        ]);
        expect(await executor.collect?.([view("r2")], now)).toMatchObject([
            { outcome: "failed" },
        ]);
        expect(await executor.collect?.([view("r3")], now)).toMatchObject([
            { outcome: "success" },
        ]);
    });

    it("reports a run once, even when two readers collect it", async () => {
        const executor = createFakeExecutor(scriptedPorts(["failed"]));
        const now = elapsed(FAKE_RUN_DURATION_MS);

        expect(await executor.collect?.([view("r1")], now)).toHaveLength(1);
        expect(await executor.collect?.([view("r1")], now)).toEqual([]);
    });

    it("stays silent on a silent outcome, so the timeout ends the run", async () => {
        const executor = createFakeExecutor(scriptedPorts(["silent"]));
        const now = elapsed(FAKE_RUN_DURATION_MS);

        expect(await executor.collect?.([view("r1")], now)).toEqual([]);
        expect(await executor.collect?.([view("r1")], now)).toEqual([]);
    });

    it("asks a question the agent contract accepts on needs_input", async () => {
        const executor = createFakeExecutor(scriptedPorts(["needs_input"]));
        const [report] =
            (await executor.collect?.(
                [view("r1")],
                elapsed(FAKE_RUN_DURATION_MS)
            )) ?? [];

        expect(report?.questions).toHaveLength(1);
        expect(
            askInputSchema.safeParse({
                cardId: "b1__search-cards",
                stage: "analyze",
                questions: report?.questions,
            }).success
        ).toBe(true);
    });

    it("notes the dispatch on the card and accepts it", async () => {
        const ports = scriptedPorts();
        const executor = createFakeExecutor(ports);

        const result = await executor.dispatch({
            runId: "r1",
            boardId: "b1",
            cardId: "b1__search-cards",
            slug: "search-cards",
            stageKey: "analyze",
            command: "/analyze",
            agent: null,
            model: "opus",
            effort: "high",
            maxTurns: 200,
            branch: "feat/search-cards",
            repository: { owner: "agent-board-demo", name: "sample-app" },
            triggeredBy: { userId: "p1", login: "octo" },
        });

        expect(result).toEqual({ ok: true, sessionUrl: null });
        expect(ports.note).toHaveBeenCalledWith(
            expect.objectContaining({ runId: "r1" }),
            expect.stringContaining("`/analyze search-cards`")
        );
    });
});

describe("toFakeScript", () => {
    it("drops unknown outcomes and tolerates a missing document", () => {
        expect(toFakeScript(undefined)).toBeNull();
        expect(
            toFakeScript({ outcomes: ["success", "explode", "silent"] })
        ).toEqual({ outcomes: ["success", "silent"], claims: {} });
    });
});

describe("fake-executor.mjs", () => {
    const scriptsDir = join(__dirname, "../scripts");
    // Only the variables under test: nothing from the developer's shell reaches the script.
    const run = (env: Record<string, string>) =>
        spawnSync(
            process.execPath,
            [
                join(scriptsDir, "fake-executor.mjs"),
                "script",
                "board",
                "slug",
                "failed",
            ],
            {
                env: {
                    PATH: process.env.PATH ?? "",
                    ...env,
                } as unknown as NodeJS.ProcessEnv,
                encoding: "utf8",
            }
        );

    it("refuses to run without both emulators", () => {
        const result = run({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-x" });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Refusing to seed");
    });

    it("refuses a project that is not a demo one, even with the emulators set", () => {
        const result = run({
            FIRESTORE_EMULATOR_HOST: "127.0.0.1:1",
            FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:1",
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: "agent-board-prod",
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
            'the target project is "agent-board-prod"'
        );
    });
});
