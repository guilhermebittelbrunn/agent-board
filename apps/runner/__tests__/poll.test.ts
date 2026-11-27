import { describe, expect, it, vi } from "vitest";
import { ApiError, type RunnerApi } from "../src/api.ts";
import { pollForWork } from "../src/poll.ts";

const UNAUTHORIZED = 401;
const POLLS_BEFORE_CTRL_C = 3;

const apiWith = (claim: RunnerApi["claim"]): RunnerApi => ({
    claim,
    heartbeat: vi.fn(),
    finish: vi.fn(),
    tool: vi.fn(),
});

const options = (api: RunnerApi, signal: AbortSignal) => ({
    api,
    signal,
    apiUrl: "http://x",
    runner: { name: "m", id: "runnerM1" },
    home: "/nowhere",
    repoBase: "file:///nowhere",
    agent: { command: "true", args: [] },
    permissions: { mode: "acceptEdits" as const, allow: [] },
    keepWorktrees: false,
    log: () => null,
    pollIntervalMs: 1,
});

describe("pollForWork", () => {
    it("ends when the board says the runner was revoked", async () => {
        const api = apiWith(() =>
            Promise.reject(new ApiError(UNAUTHORIZED, "RUNNER_REVOKED"))
        );
        await expect(
            pollForWork(options(api, new AbortController().signal))
        ).resolves.toEqual({ reason: "refused", code: "RUNNER_REVOKED" });
    });

    it("keeps polling while there is nothing to run, and stops on Ctrl+C", async () => {
        const controller = new AbortController();
        let polls = 0;
        const api = apiWith(() => {
            polls += 1;
            if (polls === POLLS_BEFORE_CTRL_C) {
                controller.abort();
            }
            return Promise.resolve({ job: null });
        });

        await expect(
            pollForWork(options(api, controller.signal))
        ).resolves.toEqual({
            reason: "stopped",
        });
        expect(polls).toBe(POLLS_BEFORE_CTRL_C);
    });

    it("waits and retries when the board is unreachable", async () => {
        const controller = new AbortController();
        let polls = 0;
        const api = apiWith(() => {
            polls += 1;
            if (polls === 1) {
                return Promise.reject(new TypeError("fetch failed"));
            }
            controller.abort();
            return Promise.resolve({ job: null });
        });

        await pollForWork(options(api, controller.signal));
        expect(polls).toBe(2);
    });
});
