#!/usr/bin/env node
/**
 * Test agent for the local runner: stands in for `claude -p` without any paid call. It walks
 * the same path a real session does — reads the card, posts an update, commits and pushes a
 * file, closes the stage — and prints a fake `stream-json` so the runner counts turns.
 *
 * It refuses to push anywhere but a `file://` remote, so it can never touch a real
 * repository.
 *
 * Env: STUB_TURNS (default 3), STUB_OUTCOME or STUB_OUTCOME_<STAGE> (success, needs_input,
 * needs_rework, failed, none), STUB_HANG=1 to wait for a signal.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flagValue = (flag) => {
    const position = argv.indexOf(flag);
    return position === -1 ? null : argv[position + 1];
};
const fail = (message) => {
    process.stderr.write(`stub-agent: ${message}\n`);
    process.exit(1);
};
const emit = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);

const token = process.env.KANBAN_RUN_TOKEN;
const apiUrl = process.env.KANBAN_API_URL;
const cardId = process.env.KANBAN_CARD_ID;
if (!(token && apiUrl && cardId)) {
    fail("KANBAN_RUN_TOKEN, KANBAN_API_URL e KANBAN_CARD_ID são obrigatórios");
}
if (Object.values(process.env).some((value) => value?.startsWith("kbl_"))) {
    fail("o token do runner chegou ao agente");
}

const mcpPath = flagValue("--mcp-config");
const mcp = JSON.parse(readFileSync(mcpPath ?? "", "utf8"));
if (!mcp.mcpServers?.kanban?.url?.endsWith("/mcp")) {
    fail("--mcp-config não aponta para /mcp");
}

const prompt = flagValue("-p") ?? "";
const [command, slug] = prompt.split(" ");

async function tool(name, input) {
    const response = await fetch(`${apiUrl}/agent/tools/${name}`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        fail(`${name} → ${response.status} ${body?.error?.code ?? ""}`);
    }
    return body?.data;
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const sessionId = randomUUID();
emit({ type: "system", subtype: "init", session_id: sessionId });

const view = await tool("get_card", { cardId });
const stage = view.run.stageKey;
const ref = { cardId, stage };

const DEFAULT_TURNS = 3;
const HANG_TICK_MS = 60_000;
const turns = Number(process.env.STUB_TURNS ?? DEFAULT_TURNS);
for (let turn = 1; turn <= turns; turn += 1) {
    emit({
        type: "assistant",
        parent_tool_use_id: null,
        session_id: sessionId,
        message: {
            id: `msg_${turn}`,
            content: [
                {
                    type: "tool_use",
                    name: turn === 1 ? "mcp__kanban__get_card" : "Bash",
                },
            ],
        },
    });
}

if (process.env.STUB_HANG === "1") {
    await new Promise(() => setInterval(() => null, HANG_TICK_MS));
}

await tool("post_update", {
    ...ref,
    markdown: `Agente de teste rodando \`${command} ${slug}\`.`,
});

const remote = git("remote", "get-url", "origin");
if (!remote.startsWith("file://")) {
    fail(`push recusado: o remoto ${remote} não é file://`);
}
const file = path.join("docs", "features", slug, "runner-smoke", `${stage}.md`);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(
    file,
    `# ${command} ${slug}\n\nEscrito pelo agente de teste do runner.\n`
);
git("add", file);
git(
    "-c",
    "user.name=runner-stub",
    "-c",
    "user.email=runner-stub@localhost",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--allow-empty",
    "-m",
    `docs(features): ${slug} ${stage} smoke`
);
git("push", "-u", "origin", view.run.branch);

const outcome =
    process.env[`STUB_OUTCOME_${stage.toUpperCase().replaceAll("-", "_")}`] ??
    process.env.STUB_OUTCOME ??
    "success";

if (outcome !== "none") {
    if (outcome === "needs_input") {
        await tool("ask", {
            ...ref,
            questions: [
                {
                    question: "Qual caminho a etapa deve seguir?",
                    header: "Caminho",
                    options: [
                        {
                            label: "Seguir o plano",
                            description: "Mantém o que já foi decidido.",
                        },
                        {
                            label: "Reduzir o escopo",
                            description: "Entrega só o essencial.",
                        },
                    ],
                    recommended: 0,
                },
            ],
        });
    }
    await tool("complete_stage", {
        ...ref,
        outcome,
        summary: [
            `### ${command} — agente de teste: ${outcome}`,
            "",
            "**O que foi feito:** um arquivo de prova commitado e enviado ao repositório local.",
            "**Decisões tomadas sem você:** nenhuma.",
            `**Commits:** \`${git("rev-parse", "--short", "HEAD")}\` docs(features): ${slug} ${stage} smoke`,
            "**Verificação:** nenhuma; agente de teste.",
            "**Pendências:** nenhuma.",
        ].join("\n"),
    });
}

emit({
    type: "result",
    subtype: "success",
    total_cost_usd: 0,
    num_turns: turns,
    session_id: sessionId,
});
