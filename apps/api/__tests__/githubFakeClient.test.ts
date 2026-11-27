import { createHash } from "node:crypto";
import { parseBoardConfig } from "@repo/kanban-contract";
import { parseBoardConfigYaml } from "@repo/kanban-contract/board-config-yaml";
import { parseSpecFrontmatter } from "@repo/kanban-contract/spec-frontmatter";
import { describe, expect, it } from "vitest";
import { createGithubFakeClient } from "@/(shared)/lib/github/github-fake-client";
import { createGithubPermissionCache } from "@/(shared)/lib/github/github-permission-cache";
import {
    BOARD_CONFIG_PATH,
    SAMPLE_BACKLOG_INDEX_PATH,
    SAMPLE_BOARD_CONFIGS,
} from "@/(shared)/lib/github/github-sample-repositories";

const client = createGithubFakeClient(createGithubPermissionCache());

const MAX_FAKE_NUMBER = 9999;
const repo = (name: string) => ({
    installationId: 1,
    owner: "agent-board-demo",
    name,
});

describe("githubFakeClient", () => {
    it("lists the three sample repositories of installation 1", async () => {
        const repositories = await client.listInstallationRepositories();

        expect(repositories.map((r) => r.fullName)).toEqual([
            "agent-board-demo/sample-app",
            "agent-board-demo/invalid-config",
            "agent-board-demo/no-kanban",
        ]);
        expect(
            repositories.every(
                (r) => r.installationId === 1 && r.defaultBranch === "main"
            )
        ).toBe(true);
    });

    it("reads the board config with a git blob sha", async () => {
        const file = await client.readFile(
            repo("sample-app"),
            BOARD_CONFIG_PATH,
            "main"
        );
        expect(file).not.toBeNull();

        const bytes = Buffer.from(file?.content ?? "");
        const blobSha = createHash("sha1")
            .update(`blob ${bytes.length}\0`)
            .update(bytes)
            .digest("hex");

        expect(file?.content).toContain("name: sample-app");
        expect(file?.sha).toBe(blobSha);
    });

    it("answers null for a repository without the kit, a missing path or another ref", async () => {
        expect(
            await client.readFile(repo("no-kanban"), BOARD_CONFIG_PATH, "main")
        ).toBeNull();
        expect(
            await client.readFile(repo("sample-app"), "README.md", "main")
        ).toBeNull();
        expect(
            await client.readFile(repo("sample-app"), BOARD_CONFIG_PATH, "dev")
        ).toBeNull();
    });

    it("serves the sample-app backlog with the frontmatter each sync outcome needs", async () => {
        const read = async (path: string) =>
            (await client.readFile(repo("sample-app"), path, "main"))
                ?.content ?? null;
        const frontmatterOf = async (path: string) => {
            const content = await read(path);
            return content === null ? "missing" : parseSpecFrontmatter(content);
        };

        expect(await read(SAMPLE_BACKLOG_INDEX_PATH)).toContain(
            "features/search-cards.md"
        );
        expect(
            await frontmatterOf("specs/features/search-cards.md")
        ).toMatchObject({
            ok: true,
            spec: { id: "search-cards", status: "approved" },
        });
        expect(
            await frontmatterOf("specs/features/slack-alerts.md")
        ).toMatchObject({
            ok: true,
            spec: { status: "proposed" },
        });
        expect(
            await frontmatterOf("specs/features/keyboard-shortcuts.md")
        ).toMatchObject({
            ok: true,
            spec: { title: null, status: "approved" },
        });
        expect(
            await frontmatterOf("specs/features/dark-theme.md")
        ).toMatchObject({
            ok: true,
            spec: { status: "approved" },
        });
        expect(
            await frontmatterOf("docs/features/fork-cleanup/spec.md")
        ).toMatchObject({ ok: true, spec: { status: "done" } });
        expect(
            await frontmatterOf("specs/features/broken-frontmatter.md")
        ).toEqual({ ok: false });
        expect(await frontmatterOf("specs/README.md")).toBeNull();
        expect(await frontmatterOf("specs/features/legacy-export.md")).toBe(
            "missing"
        );
    });

    it("throws not_found for a repository outside the samples", async () => {
        await expect(
            client.readFile(repo("unknown"), BOARD_CONFIG_PATH, "main")
        ).rejects.toMatchObject({ kind: "not_found" });
        await expect(
            client.getCollaboratorRole(
                { ...repo("sample-app"), installationId: 2 },
                "octocat"
            )
        ).rejects.toMatchObject({ kind: "not_found" });
    });

    it("makes everyone outside the QA logins an admin of the samples", async () => {
        expect(
            await client.getCollaboratorRole(repo("sample-app"), "anyone")
        ).toBe("admin");
    });

    it("answers the listed permission for the QA logins, ignoring case", async () => {
        const fresh = createGithubFakeClient(createGithubPermissionCache());
        expect(
            await fresh.getCollaboratorRole(repo("sample-app"), "qa-reader")
        ).toBe("read");
        expect(
            await fresh.getCollaboratorRole(repo("no-kanban"), "QA-Outsider")
        ).toBe("none");
        expect(
            await fresh.getCollaboratorRole(repo("sample-app"), "qa-writer")
        ).toBe("write");
        expect(
            await fresh.getCollaboratorRole(repo("sample-app"), "qa-maintainer")
        ).toBe("maintain");
    });
});

describe("sample board configs", () => {
    it("the valid sample passes the board.yml schema", () => {
        expect(parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid).success).toBe(true);
    });

    it("the invalid sample fails on the rework target of its third stage", () => {
        const result = parseBoardConfig(SAMPLE_BOARD_CONFIGS.invalid);

        expect(result.success).toBe(false);
        expect(result.error?.issues.map((issue) => issue.path)).toEqual([
            ["stages", 2, "onRework"],
        ]);
    });
});

describe("sample board.yml text", () => {
    it("parses into the sample objects once the schema defaults are applied", async () => {
        const valid = await client.readFile(
            repo("sample-app"),
            BOARD_CONFIG_PATH,
            "main"
        );
        const invalid = await client.readFile(
            repo("invalid-config"),
            BOARD_CONFIG_PATH,
            "main"
        );

        const validResult = parseBoardConfigYaml(valid?.content ?? "");
        const expected = parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid);
        expect(validResult).toEqual({ ok: true, config: expected.data });

        const invalidResult = parseBoardConfigYaml(invalid?.content ?? "");
        expect(invalidResult).toMatchObject({
            ok: false,
            raw: SAMPLE_BOARD_CONFIGS.invalid,
            issues: [
                {
                    path: "stages[2].onRework",
                    rule: "rework_target_invalid",
                },
            ],
        });
        expect(invalidResult.ok ? null : invalidResult.raw).toEqual(
            SAMPLE_BOARD_CONFIGS.invalid
        );
    });
});

describe("githubFakeClient pull requests", () => {
    const input = (head: string) => ({
        head,
        base: "main",
        title: "Login",
        body: "",
        draft: true,
    });

    it("answers the same pull request for the same branch", async () => {
        const first = await client.createPullRequest(
            repo("sample-app"),
            input("feat/login")
        );
        const again = await client.findOpenPullRequest(
            repo("sample-app"),
            "feat/login"
        );

        expect(first).toMatchObject({
            title: "Login",
            draft: true,
            headRef: "feat/login",
            baseRef: "main",
            commits: 3,
        });
        expect(first.number).toBeGreaterThanOrEqual(1);
        expect(first.number).toBeLessThanOrEqual(MAX_FAKE_NUMBER);
        expect(first.url).toBe(
            `https://github.com/agent-board-demo/sample-app/pull/${first.number}`
        );
        expect(again?.number).toBe(first.number);
        expect(again?.headSha).toBe(first.headSha);
    });

    it("refuses the reserved branches like a real App would", async () => {
        await expect(
            client.createPullRequest(
                repo("sample-app"),
                input("feat/qa-pr-permission")
            )
        ).rejects.toMatchObject({ kind: "permission_denied" });
        await expect(
            client.createPullRequest(
                repo("sample-app"),
                input("feat/qa-pr-rejected")
            )
        ).rejects.toMatchObject({ kind: "unprocessable" });
        expect(
            await client.findOpenPullRequest(
                repo("sample-app"),
                "feat/qa-pr-rejected"
            )
        ).toBeNull();
    });

    it("does not reach a repository outside the samples", async () => {
        await expect(
            client.createPullRequest(repo("other"), input("feat/x"))
        ).rejects.toMatchObject({ kind: "not_found" });
    });
});
