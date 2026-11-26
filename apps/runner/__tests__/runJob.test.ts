import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRunnerApi } from "../src/api.ts";
import { runJob } from "../src/run-job.ts";
import { jobFixture, SECRET } from "./fixtures.ts";

const scripts = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../scripts"
);
const STUB = path.join(scripts, "stub-agent.mjs");
const FIXTURE = path.join(scripts, "fixture-repo.mjs");
const RUNNER_TOKEN = `kbl_runnerA_${SECRET}`;

type Call = {
    path: string;
    auth: string | null;
    body: Record<string, unknown>;
};

const calls: Call[] = [];
let completed = false;
let server: Server;
let apiUrl = "";
let root = "";

function respond(call: Call): unknown {
    if (call.path.endsWith("/get_card")) {
        return { run: { stageKey: "analyze", branch: "feat/search-cards" } };
    }
    if (call.path.endsWith("/complete_stage")) {
        const ignored = completed;
        completed = true;
        return { ignored };
    }
    if (call.path.endsWith("/heartbeat")) {
        return { active: true };
    }
    if (call.path.endsWith("/finish")) {
        return { recorded: true };
    }
    return { eventId: "e1" };
}

beforeAll(async () => {
    server = createServer((req, res) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
        });
        req.on("end", () => {
            const call: Call = {
                path: req.url ?? "",
                auth: req.headers.authorization ?? null,
                body: raw ? JSON.parse(raw) : {},
            };
            calls.push(call);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ data: respond(call) }));
        });
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
    );
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
});

afterEach(async () => {
    calls.length = 0;
    completed = false;
    Reflect.deleteProperty(process.env, "STUB_OUTCOME");
    Reflect.deleteProperty(process.env, "AGENT_BOARD_RUNNER_TOKEN");
    if (root !== "") {
        await rm(root, { recursive: true, force: true });
    }
});

async function run() {
    root = await mkdtemp(path.join(os.tmpdir(), "runner-job-"));
    const repos = path.join(root, "repos");
    execFileSync(process.execPath, [FIXTURE, repos]);
    const home = path.join(root, "home");
    process.env.AGENT_BOARD_RUNNER_TOKEN = RUNNER_TOKEN;
    const result = await runJob(jobFixture(), {
        apiUrl,
        runnerName: "qa-runner",
        home,
        repoBase: `file://${repos}`,
        agent: { command: process.execPath, args: [STUB] },
        permissions: { mode: "acceptEdits", allow: [] },
        keepWorktrees: false,
        api: createRunnerApi(apiUrl, RUNNER_TOKEN),
        log: () => null,
        signal: new AbortController().signal,
    });
    return { result, repos, home };
}

const toolCalls = (name: string) =>
    calls.filter((call) => call.path === `/agent/tools/${name}`);

describe("runJob with the stub agent and a local bare repository", () => {
    it("clones, works on the card's branch, pushes, reports and cleans up", async () => {
        const { result, repos, home } = await run();

        expect(result).toMatchObject({
            exit: "exited",
            turns: 3,
            revoked: false,
        });
        const bare = path.join(repos, "agent-board-demo", "sample-app.git");
        const log = execFileSync(
            "git",
            ["log", "--format=%s", "feat/search-cards"],
            { cwd: bare, encoding: "utf8" }
        );
        expect(log).toContain("docs(features): search-cards analyze smoke");
        expect(log).toContain("chore: sample app");

        expect(toolCalls("post_update")[0]?.body.markdown).toBe(
            "Runner `qa-runner` começou `/analyze search-cards` na branch `feat/search-cards`."
        );
        expect(toolCalls("complete_stage")[0]?.body.outcome).toBe("success");
        for (const call of calls.filter((c) => c.path.startsWith("/agent/"))) {
            expect(call.auth).toBe(`Bearer kbr_run1_${SECRET}`);
        }
        const finish = calls.filter(
            (call) => call.path === "/runner/runs/run1/finish"
        );
        expect(finish).toHaveLength(1);
        expect(finish[0]?.auth).toBe(`Bearer ${RUNNER_TOKEN}`);
        expect(finish[0]?.body).toMatchObject({ exit: "exited", turns: 3 });

        expect(await readdir(path.join(home, "worktrees"))).toEqual([]);
        expect(existsSync(path.join(home, "runs", "run1"))).toBe(false);
    });

    it("closes the stage as failed when the agent ends without complete_stage", async () => {
        process.env.STUB_OUTCOME = "none";

        const { result } = await run();

        expect(result.exit).toBe("exited");
        const [closing] = toolCalls("complete_stage");
        expect(closing?.body.outcome).toBe("failed");
        expect(String(closing?.body.summary)).toContain(
            "O agente terminou sem chamar complete_stage."
        );
    });
});

describe("runJob after a run that left its worktree behind", () => {
    it("removes the old worktree of the card's branch and runs again", async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "runner-job-"));
        const repos = path.join(root, "repos");
        execFileSync(process.execPath, [FIXTURE, repos]);
        const home = path.join(root, "home");
        process.env.AGENT_BOARD_RUNNER_TOKEN = RUNNER_TOKEN;
        const context = (keepWorktrees: boolean) => ({
            apiUrl,
            runnerName: "qa-runner",
            home,
            repoBase: `file://${repos}`,
            agent: { command: process.execPath, args: [STUB] },
            permissions: { mode: "acceptEdits" as const, allow: [] },
            keepWorktrees,
            api: createRunnerApi(apiUrl, RUNNER_TOKEN),
            log: () => null,
            signal: new AbortController().signal,
        });

        await runJob(jobFixture(), context(true));
        completed = false;
        const second = await runJob(
            jobFixture({ runId: "run2", runToken: `kbr_run2_${SECRET}` }),
            context(false)
        );

        expect(second.exit).toBe("exited");
        expect(
            toolCalls("complete_stage").map((call) => call.body.outcome)
        ).toEqual(["success", "failed", "success", "failed"]);
        expect(await readdir(path.join(home, "worktrees"))).toEqual([]);
        expect(await readdir(path.join(home, "runs"))).toEqual([]);
    });
});

describe("stub agent", () => {
    it("refuses to push to a remote that is not file://", async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "runner-stub-"));
        execFileSync("git", ["init", "--initial-branch=main"], { cwd: root });
        execFileSync(
            "git",
            [
                "remote",
                "add",
                "origin",
                "https://github.com/agent-board-demo/sample-app.git",
            ],
            { cwd: root }
        );
        const mcp = path.join(root, "mcp.json");
        execFileSync(process.execPath, [
            "-e",
            `require("fs").writeFileSync(${JSON.stringify(mcp)}, JSON.stringify({ mcpServers: { kanban: { url: "${apiUrl}/mcp" } } }))`,
        ]);

        // Async on purpose: the fake API answers from this same process.
        const child = await new Promise<{
            status: number | null;
            stderr: string;
        }>((resolve) => {
            const stub = spawn(
                process.execPath,
                [
                    STUB,
                    "-p",
                    "/analyze search-cards --board c",
                    "--mcp-config",
                    mcp,
                ],
                {
                    cwd: root,
                    env: {
                        PATH: process.env.PATH,
                        KANBAN_RUN_TOKEN: `kbr_run1_${SECRET}`,
                        KANBAN_API_URL: apiUrl,
                        KANBAN_CARD_ID: "c",
                    },
                }
            );
            let stderr = "";
            stub.stderr.on("data", (chunk) => {
                stderr += chunk;
            });
            stub.on("close", (status) => resolve({ status, stderr }));
        });

        expect(child.status).toBe(1);
        expect(child.stderr).toContain("não é file://");
        expect(toolCalls("complete_stage")).toHaveLength(0);
    });
});
