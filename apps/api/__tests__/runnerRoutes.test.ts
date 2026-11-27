import { parseBoardConfig } from "@repo/kanban-contract";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BOARD_CONFIGS } from "@/(shared)/lib/github/github-sample-repositories";
import {
    hashRunSecretForTest,
    RUN_SECRET,
    RUN_SECRET_LENGTH,
} from "./agentRunFixtures";
import {
    HALF_MINUTE_MS,
    isoBefore,
    NOW,
    runFixture,
    runnerFixture,
    SECOND_MS,
} from "./runnerFixtures";

const {
    findWithTokenMock,
    touchMock,
    registerWithCodeMock,
    claimNextMock,
    recordTurnsMock,
    finishRunMock,
    findBoardMock,
    appendAgentEventMock,
    tickMock,
} = vi.hoisted(() => ({
    findWithTokenMock: vi.fn(),
    touchMock: vi.fn(),
    registerWithCodeMock: vi.fn(),
    claimNextMock: vi.fn(),
    recordTurnsMock: vi.fn(),
    finishRunMock: vi.fn(),
    findBoardMock: vi.fn(),
    appendAgentEventMock: vi.fn(),
    tickMock: vi.fn(),
}));

vi.mock("@/(shared)/lib/orchestrator/tick-safely", () => ({
    tickSafely: (...args: unknown[]) => tickMock(...args),
}));

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: {},
}));

vi.mock("@/(shared)/repositories/runner.repository", () => ({
    runnerRepository: {
        findWithToken: (...args: unknown[]) => findWithTokenMock(...args),
        touch: (...args: unknown[]) => touchMock(...args),
        registerWithCode: (...args: unknown[]) => registerWithCodeMock(...args),
        claimNext: (...args: unknown[]) => claimNextMock(...args),
        recordTurns: (...args: unknown[]) => recordTurnsMock(...args),
        finishRun: (...args: unknown[]) => finishRunMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/board.repository", () => ({
    boardRepository: {
        findById: (...args: unknown[]) => findBoardMock(...args),
    },
}));

vi.mock("@/(shared)/repositories/card-event.repository", () => ({
    cardEventRepository: {
        appendAgentEvent: (...args: unknown[]) => appendAgentEventMock(...args),
    },
}));

const { POST: REGISTER } = await import("@/app/(routes)/runner/register/route");
const { POST: CLAIM } = await import("@/app/(routes)/runner/claim/route");
const { POST: HEARTBEAT } = await import(
    "@/app/(routes)/runner/runs/[runId]/heartbeat/route"
);
const { POST: FINISH } = await import(
    "@/app/(routes)/runner/runs/[runId]/finish/route"
);

const TOKEN = `kbl_runnerA_${RUN_SECRET}`;
const RUNNER_TOKEN_SHAPE = /^kbl_runnerA_[A-Za-z0-9_-]{43}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const config = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).data;

function request(
    body: unknown = {},
    authorization: string | null = `Bearer ${TOKEN}`
) {
    const headers = new Headers({ "content-type": "application/json" });
    if (authorization !== null) {
        headers.set("authorization", authorization);
    }
    const text = JSON.stringify(body);
    return {
        method: "POST",
        url: "http://localhost:3002/runner/claim",
        headers,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(text),
        body: null,
    } as unknown as NextRequest;
}

const noParams = { params: Promise.resolve({}) };
const runParams = (runId = "run1") => ({ params: Promise.resolve({ runId }) });

async function errorCode(response: Response): Promise<string> {
    return ((await response.json()) as { error: { code: string } }).error.code;
}

beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    for (const mock of [
        findWithTokenMock,
        touchMock,
        registerWithCodeMock,
        claimNextMock,
        recordTurnsMock,
        finishRunMock,
        findBoardMock,
        appendAgentEventMock,
        tickMock,
    ]) {
        mock.mockReset();
    }
    findWithTokenMock.mockResolvedValue({
        runner: runnerFixture(),
        tokenHash: hashRunSecretForTest(RUN_SECRET),
    });
    findBoardMock.mockResolvedValue({
        id: "agent-board-demo--sample-app",
        repository: { owner: "agent-board-demo", name: "sample-app" },
        config,
    });
});

describe("POST /runner/register", () => {
    it("refuses an unknown, expired or used code with one answer", async () => {
        registerWithCodeMock.mockResolvedValue({ ok: false });

        const response = await REGISTER(
            request({ code: "KQ7M-4XPD", name: "macbook" }, null)
        );

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(await errorCode(response)).toBe("RUNNER_CODE_INVALID");
    });

    it("hands the token out once and gives the repository only the hash", async () => {
        registerWithCodeMock.mockImplementation(
            (registration: {
                codeHash: string;
                mint: (id: string) => { token: string; tokenHash: string };
            }) => {
                const minted = registration.mint("runnerA");
                return Promise.resolve({
                    ok: true,
                    runner: runnerFixture(),
                    token: minted.token,
                    stored: minted.tokenHash,
                });
            }
        );

        const response = await REGISTER(
            request({ code: "kq7m-4xpd", name: "macbook" }, null)
        );
        const body = (await response.json()) as {
            data: { runnerId: string; token: string };
        };

        expect(response.status).toBe(HTTP_STATUS.CREATED);
        expect(body.data.token).toMatch(RUNNER_TOKEN_SHAPE);
        const [input] = registerWithCodeMock.mock.calls[0] as [
            { codeHash: string },
        ];
        expect(input.codeHash).toMatch(SHA256_HEX);
        expect(input.codeHash).not.toContain("KQ7M4XPD");
    });
});

describe("runner guard", () => {
    it("refuses a call without a token, before reading anything", async () => {
        const response = await CLAIM(request({}, null), noParams);

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
        expect(await errorCode(response)).toBe("RUNNER_TOKEN_INVALID");
        expect(findWithTokenMock).not.toHaveBeenCalled();
    });

    it("refuses a run token where a runner token is expected", async () => {
        const response = await CLAIM(
            request({}, `Bearer kbr_run1_${RUN_SECRET}`),
            noParams
        );

        expect(await errorCode(response)).toBe("RUNNER_TOKEN_INVALID");
        expect(findWithTokenMock).not.toHaveBeenCalled();
    });

    it("refuses a wrong secret like a missing runner", async () => {
        findWithTokenMock.mockResolvedValue({
            runner: runnerFixture(),
            tokenHash: hashRunSecretForTest("B".repeat(RUN_SECRET_LENGTH)),
        });

        const response = await CLAIM(request(), noParams);

        expect(await errorCode(response)).toBe("RUNNER_TOKEN_INVALID");
        expect(claimNextMock).not.toHaveBeenCalled();
    });

    it("tells a revoked runner it was revoked", async () => {
        findWithTokenMock.mockResolvedValue({
            runner: runnerFixture({ deletedAt: isoBefore(SECOND_MS) }),
            tokenHash: hashRunSecretForTest(RUN_SECRET),
        });

        const response = await CLAIM(request(), noParams);

        expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(await errorCode(response)).toBe("RUNNER_REVOKED");
        expect(claimNextMock).not.toHaveBeenCalled();
    });

    it("writes the last contact only every 30 s", async () => {
        claimNextMock.mockResolvedValue(null);

        await CLAIM(request(), noParams);
        expect(touchMock).not.toHaveBeenCalled();

        findWithTokenMock.mockResolvedValue({
            runner: runnerFixture({ lastSeenAt: isoBefore(HALF_MINUTE_MS) }),
            tokenHash: hashRunSecretForTest(RUN_SECRET),
        });
        await CLAIM(request(), noParams);
        expect(touchMock).toHaveBeenCalledWith("runnerA", NOW);
    });
});

describe("POST /runner/claim", () => {
    it("answers job: null when there is nothing to run or the runner is busy", async () => {
        claimNextMock.mockResolvedValue(null);

        const response = await CLAIM(request(), noParams);

        expect(await response.json()).toEqual({ data: { job: null } });
    });

    it("hands over the job with the repository, install and the run token", async () => {
        claimNextMock.mockResolvedValue({
            run: runFixture({ runnerId: "runnerA" }),
            token: `kbr_run1_${RUN_SECRET}`,
        });

        const response = await CLAIM(request(), noParams);
        const { data } = (await response.json()) as {
            data: { job: Record<string, unknown> };
        };

        expect(data.job).toMatchObject({
            runId: "run1",
            command: "/analyze",
            branch: "feat/search-cards",
            repository: {
                owner: "agent-board-demo",
                name: "sample-app",
                baseBranch: config?.baseBranch,
            },
            runToken: `kbr_run1_${RUN_SECRET}`,
        });
        expect(JSON.stringify(data)).not.toContain(TOKEN);
    });
});

describe("POST /runner/runs/[runId]/heartbeat", () => {
    it("refuses a run another runner claimed", async () => {
        recordTurnsMock.mockResolvedValue({
            ok: false,
            code: "RUNNER_RUN_MISMATCH",
        });

        const response = await HEARTBEAT(request({ turns: 3 }), runParams());

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(await errorCode(response)).toBe("RUNNER_RUN_MISMATCH");
    });

    it("answers active: false for a run stopped on the board", async () => {
        recordTurnsMock.mockResolvedValue({
            ok: true,
            run: runFixture({ active: false, status: "stopped" }),
        });

        const response = await HEARTBEAT(request({ turns: 3 }), runParams());

        expect(await response.json()).toEqual({ data: { active: false } });
    });

    it("refuses negative turns", async () => {
        const response = await HEARTBEAT(request({ turns: -1 }), runParams());

        expect(await errorCode(response)).toBe("VALIDATION_FAILED");
        expect(recordTurnsMock).not.toHaveBeenCalled();
    });
});

describe("POST /runner/runs/[runId]/finish", () => {
    const finish = { turns: 84, durationMs: 720_000, exit: "exited" };

    it("writes one timeline note, and none for a repeated finish", async () => {
        finishRunMock.mockResolvedValueOnce({
            ok: true,
            run: runFixture({ runnerId: "runnerA" }),
            recorded: true,
        });
        finishRunMock.mockResolvedValueOnce({
            ok: true,
            run: runFixture({ runnerId: "runnerA" }),
            recorded: false,
        });

        const first = await FINISH(request(finish), runParams());
        const second = await FINISH(request(finish), runParams());

        expect(await first.json()).toEqual({ data: { recorded: true } });
        expect(await second.json()).toEqual({ data: { recorded: false } });
        expect(appendAgentEventMock).toHaveBeenCalledTimes(1);
        const [, write] = appendAgentEventMock.mock.calls[0] as [
            unknown,
            { markdown: string; runId: string; type: string },
        ];
        expect(write.type).toBe("update");
        expect(write.runId).toBe("run1");
        expect(write.markdown).toContain("terminou em 12 min · 84 turnos");
    });

    it("closes a cycle run that hit its deadline, and only that", async () => {
        const cycleRun = runFixture({ runnerId: "runnerA", cycleId: "c1" });
        finishRunMock.mockResolvedValue({
            ok: true,
            run: cycleRun,
            recorded: true,
        });

        await FINISH(request({ ...finish, exit: "deadline" }), runParams());
        expect(tickMock).toHaveBeenCalledTimes(1);

        await FINISH(request(finish), runParams());
        finishRunMock.mockResolvedValue({
            ok: true,
            run: runFixture({ runnerId: "runnerA" }),
            recorded: true,
        });
        await FINISH(request({ ...finish, exit: "deadline" }), runParams());
        expect(tickMock).toHaveBeenCalledTimes(1);
    });

    it("refuses a run this runner did not claim", async () => {
        finishRunMock.mockResolvedValue({
            ok: false,
            code: "RUNNER_RUN_MISMATCH",
        });

        const response = await FINISH(request(finish), runParams("run9"));

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(appendAgentEventMock).not.toHaveBeenCalled();
    });
});
