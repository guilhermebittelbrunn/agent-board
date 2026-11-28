import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.ts";
import { isSafeJob } from "../src/job.ts";
import {
    buildAgentArgs,
    buildAgentEnv,
    buildPrompt,
    mcpConfig,
    readAllowList,
} from "../src/session.ts";
import { jobFixture, SECRET } from "./fixtures.ts";

const SKIP_FLAG = "--dangerously-skip-permissions";
const BOARD_MODE_TOOLS = [
    "mcp__kanban",
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(git push)",
    "Bash(git push origin feat/search-cards)",
    "Bash(git push -u origin feat/search-cards)",
];
const NOT_A_RULE = 3;

describe("agent session", () => {
    const job = jobFixture();

    it("prompts with the command, the slug and the card only", () => {
        expect(buildPrompt(job)).toBe(
            "/analyze search-cards --board agent-board-demo--sample-app__search-cards"
        );
    });

    it("adds the cycle to the prompt only for a run inside one", () => {
        expect(buildPrompt(jobFixture({ cycleId: "Xc81" }))).toBe(
            "/analyze search-cards --board agent-board-demo--sample-app__search-cards --cycle Xc81"
        );
    });

    it("runs claude with the column's model, effort and turn limit, accepting edits by default", () => {
        const args = buildAgentArgs(job, "/r/mcp.json", {
            mode: "acceptEdits",
            allow: ["Bash(pnpm test:*)", "Bash(git status)"],
        });
        expect(args.slice(0, 2)).toEqual(["-p", buildPrompt(job)]);
        expect(args).toEqual(
            expect.arrayContaining([
                "--model",
                "opus",
                "--effort",
                "high",
                "--max-turns",
                "200",
            ])
        );
        const joined = args.join(" ");
        expect(joined).toContain("--output-format stream-json --verbose");
        expect(joined).toContain("--mcp-config /r/mcp.json");
        expect(joined).toContain("--permission-mode acceptEdits");
        expect(args.slice(args.indexOf("--allowedTools"))).toEqual([
            "--allowedTools",
            ...BOARD_MODE_TOOLS,
            "Bash(pnpm test:*)",
            "Bash(git status)",
        ]);
        expect(args).not.toContain(SKIP_FLAG);
        expect(args).not.toContain("bypassPermissions");
    });

    it("allows the kanban tools and the card branch's commit and push even with no allow list", () => {
        const args = buildAgentArgs(job, "/r/mcp.json", {
            mode: "acceptEdits",
            allow: [],
        });
        expect(args.slice(args.indexOf("--allowedTools"))).toEqual([
            "--allowedTools",
            ...BOARD_MODE_TOOLS,
        ]);
    });

    it("does not repeat a rule the repository already allows", () => {
        const args = buildAgentArgs(job, "/r/mcp.json", {
            mode: "acceptEdits",
            allow: ["Bash(git add:*)", "mcp__kanban"],
        });
        expect(args.filter((arg) => arg === "mcp__kanban")).toHaveLength(1);
        expect(args.filter((arg) => arg === "Bash(git add:*)")).toHaveLength(1);
    });

    it("skips permission checks only when asked by name", () => {
        const args = buildAgentArgs(job, "/r/mcp.json", { mode: "skip" });
        expect(args.at(-1)).toBe(SKIP_FLAG);
        expect(args).not.toContain("--permission-mode");
    });

    it("gives the agent the run token and strips the runner token", () => {
        const env = buildAgentEnv(
            {
                PATH: "/bin",
                AGENT_BOARD_RUNNER_TOKEN: "kbl_x_y",
                SOMETHING: `kbl_runnerA_${SECRET}`,
            },
            job,
            "http://localhost:3002"
        );
        expect(env.PATH).toBe("/bin");
        expect(env.KANBAN_RUN_TOKEN).toBe(job.runToken);
        expect(env.KANBAN_API_URL).toBe("http://localhost:3002");
        expect(env.KANBAN_CARD_ID).toBe(job.cardId);
        expect(
            Object.values(env).some((value) => value?.startsWith("kbl_"))
        ).toBe(false);
    });

    it("pins push.default to simple for the session, after the git config already set", () => {
        const fresh = buildAgentEnv({ PATH: "/bin" }, job, "http://x");
        expect(fresh).toMatchObject({
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "push.default",
            GIT_CONFIG_VALUE_0: "simple",
        });

        const existing = buildAgentEnv(
            {
                GIT_CONFIG_COUNT: "1",
                GIT_CONFIG_KEY_0: "core.editor",
                GIT_CONFIG_VALUE_0: "vim",
            },
            job,
            "http://x"
        );
        expect(existing).toMatchObject({
            GIT_CONFIG_COUNT: "2",
            GIT_CONFIG_KEY_0: "core.editor",
            GIT_CONFIG_KEY_1: "push.default",
            GIT_CONFIG_VALUE_1: "simple",
        });
    });

    it("points the MCP server at /mcp with the run token", () => {
        expect(mcpConfig("http://localhost:3002/", "kbr_x")).toEqual({
            mcpServers: {
                kanban: {
                    type: "http",
                    url: "http://localhost:3002/mcp",
                    headers: { Authorization: "Bearer kbr_x" },
                },
            },
        });
    });

    it("reads the repository's allow list, and none when the file is missing", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "runner-allow-"));
        expect(await readAllowList(dir)).toEqual([]);
        await mkdir(path.join(dir, ".claude"));
        await writeFile(
            path.join(dir, ".claude", "settings.json"),
            JSON.stringify({
                permissions: { allow: ["Bash(pnpm check)", NOT_A_RULE] },
            })
        );
        expect(await readAllowList(dir)).toEqual(["Bash(pnpm check)"]);
        await rm(dir, { recursive: true, force: true });
    });

    it("drops allow rules that would reach claude as a flag", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "runner-allow-"));
        await mkdir(path.join(dir, ".claude"));
        await writeFile(
            path.join(dir, ".claude", "settings.json"),
            JSON.stringify({
                permissions: {
                    allow: [
                        SKIP_FLAG,
                        "--permission-mode=bypassPermissions",
                        "-p",
                        "Bash(git status)",
                    ],
                },
            })
        );
        const allow = await readAllowList(dir);
        expect(allow).toEqual(["Bash(git status)"]);
        const args = buildAgentArgs(job, "/r/mcp.json", {
            mode: "acceptEdits",
            allow,
        });
        expect(args.slice(args.indexOf("--allowedTools"))).toEqual([
            "--allowedTools",
            ...BOARD_MODE_TOOLS,
            "Bash(git status)",
        ]);
        expect(args).not.toContain(SKIP_FLAG);
        await rm(dir, { recursive: true, force: true });
    });

    it("refuses a job whose fields could reach git or a shell as something else", () => {
        expect(isSafeJob(job)).toBe(true);
        for (const bad of [
            { branch: "--upload-pack=evil" },
            { branch: "feat/../main" },
            { slug: "a b" },
            { command: "/analyze; rm -rf /" },
            {
                repository: {
                    owner: "o/../x",
                    name: "n",
                    baseBranch: "main",
                },
            },
            { runToken: "kbl_runnerA_x" },
        ]) {
            expect(isSafeJob(jobFixture(bad))).toBe(false);
        }
    });
});

describe("parseArgs", () => {
    const env = { HOME: "/home/me" };

    it("registers with the code, the API and a name", () => {
        expect(
            parseArgs(
                [
                    "register",
                    "KQ7M-4XPD",
                    "--api",
                    "http://x",
                    "--name",
                    "mac",
                    "--home",
                    "h",
                ],
                env,
                "/w"
            )
        ).toEqual({
            command: "register",
            home: "/w/h",
            code: "KQ7M-4XPD",
            apiUrl: "http://x",
            name: "mac",
        });
    });

    it("starts with acceptEdits, claude and a 10 s poll by default", () => {
        expect(parseArgs(["start", "--home", "h"], env, "/w")).toMatchObject({
            command: "start",
            home: "/w/h",
            pollIntervalMs: 10_000,
            repoBase: "https://github.com",
            keepWorktrees: false,
            agent: { command: "claude", args: [] },
            permissions: { mode: "acceptEdits" },
        });
    });

    it("turns permission checks off only with the explicit flag", () => {
        expect(parseArgs(["start", SKIP_FLAG], env, "/w")).toMatchObject({
            permissions: { mode: "skip" },
        });
        expect(
            parseArgs(
                ["start", "--permission-mode", "bypassPermissions"],
                env,
                "/w"
            ).command
        ).toBe("error");
    });

    it("accepts --agent-command only against a file:// repository base", () => {
        expect(
            parseArgs(["start", "--agent-command", "node stub.mjs"], env, "/w")
        ).toEqual({
            command: "error",
            message: "--agent-command só é aceito com --repo-base file://…",
        });
        expect(
            parseArgs(
                [
                    "start",
                    "--agent-command",
                    "node stub.mjs",
                    "--repo-base",
                    "https://github.com",
                ],
                env,
                "/w"
            ).command
        ).toBe("error");
        expect(
            parseArgs(
                [
                    "start",
                    "--agent-command",
                    "node stub.mjs",
                    "--repo-base",
                    "file:///tmp/r",
                ],
                env,
                "/w"
            )
        ).toMatchObject({ agent: { command: "node", args: ["stub.mjs"] } });
    });

    it("refuses an unknown command", () => {
        expect(parseArgs(["deploy"], env, "/w").command).toBe("error");
    });
});
