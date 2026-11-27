import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRunnerApi, registerRunner } from "./api.ts";
import {
    defaultHome,
    defaultRunnerName,
    type RunnerConfig,
    runnerPaths,
    shortRunnerId,
    tokenEnding,
} from "./config.ts";
import {
    listCredentials,
    nextRunnerName,
    pickCredential,
    removeCredential,
    saveCredential,
} from "./credentials.ts";
import { createInterruptHandler } from "./interrupt.ts";
import { sweepLeftoverRuns } from "./leftovers.ts";
import { acquireRunnerLock, runnerHolder } from "./lock.ts";
import { pollForWork } from "./poll.ts";
import type { AgentCommand } from "./run-job.ts";
import { reportLeftovers } from "./run-job.ts";
import type { AgentPermissions } from "./session.ts";
import { killAgentsNow } from "./supervisor.ts";

export type StartOptions = {
    command: "start";
    home: string;
    /** Id, id prefix or name of the runner to start; the oldest free one when absent. */
    runner: string | null;
    /** Only runners registered against this API; one machine may serve production and a local board. */
    apiUrl: string | null;
    pollIntervalMs: number;
    repoBase: string;
    keepWorktrees: boolean;
    agent: AgentCommand;
    permissions: AgentPermissions;
};

export type RegisterOptions = {
    command: "register";
    home: string;
    code: string;
    /** When absent, the API of the last runner registered here, or the local one. */
    apiUrl: string | null;
    name: string | null;
};

export type ListOptions = { command: "list"; home: string };

export type ParsedArgs =
    | StartOptions
    | RegisterOptions
    | ListOptions
    | { command: "version" }
    | { command: "error"; message: string };

const MS_PER_SECOND = 1000;
const EXIT_USAGE = 2;
/** The shell convention for a process ended by Ctrl+C: 128 + SIGINT. */
const EXIT_INTERRUPTED = 130;
const WHITESPACE = /\s+/;
const TRAILING_SLASH = /\/+$/;
const DEFAULT_API_URL = "http://localhost:3002";
const DEFAULT_POLL_SECONDS = 10;
const DEFAULT_REPO_BASE = "https://github.com";
const SKIP_PERMISSIONS_FLAG = "--dangerously-skip-permissions";

export const USAGE = [
    "uso:",
    "  agent-board-runner register <código> [--api <url>] [--name <nome>] [--home <dir>]",
    "  agent-board-runner start [--runner <id|nome>] [--api <url>] [--home <dir>] [--poll-interval <s>]",
    `                           [--repo-base <url>] [--keep-worktrees] [${SKIP_PERMISSIONS_FLAG}]`,
    "                           [--agent-command <cmd>]",
    "  agent-board-runner list [--home <dir>]",
    "  agent-board-runner version",
    "",
    "Cada register adiciona um runner nesta máquina; cada start, num terminal novo, roda o próximo livre.",
].join("\n");

const error = (message: string): ParsedArgs => ({ command: "error", message });

/** Paths typed by the person are relative to where they ran pnpm, not to this package. */
function resolveFrom(base: string, value: string): string {
    const candidate = path.resolve(base, value);
    return existsSync(candidate) ? candidate : value;
}

type Flags = {
    has(name: string): boolean;
    hasPrefix(prefix: string): boolean;
    text(name: string): string | undefined;
};

const BOOLEAN_FLAGS = new Set(["--keep-worktrees", SKIP_PERMISSIONS_FLAG]);

function readFlags(args: string[]): { flags: Flags; positional: string[] } {
    const values = new Map<string, string | true>();
    const positional: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        const next = args[index + 1];
        if (!arg.startsWith("--")) {
            positional.push(arg);
        } else if (
            BOOLEAN_FLAGS.has(arg) ||
            next === undefined ||
            next.startsWith("--")
        ) {
            values.set(arg, true);
        } else {
            values.set(arg, next);
            index += 1;
        }
    }
    return {
        positional,
        flags: {
            has: (name) => values.has(name),
            hasPrefix: (prefix) =>
                [...values.keys()].some((key) => key.startsWith(prefix)),
            text: (name) => {
                const value = values.get(name);
                return typeof value === "string" ? value : undefined;
            },
        },
    };
}

function parseStart(flags: Flags, home: string, cwd: string): ParsedArgs {
    if (flags.hasPrefix("--permission-mode")) {
        return error(
            `--permission-mode não existe; o padrão é acceptEdits com a lista allow do repositório, e ${SKIP_PERMISSIONS_FLAG} desliga as checagens`
        );
    }
    const seconds = Number(
        flags.text("--poll-interval") ?? DEFAULT_POLL_SECONDS
    );
    if (!(Number.isFinite(seconds) && seconds >= 1)) {
        return error("--poll-interval precisa ser um número de segundos >= 1");
    }
    const repoBase = flags.text("--repo-base") ?? DEFAULT_REPO_BASE;
    const agentCommand = flags.text("--agent-command");
    if (agentCommand !== undefined && !repoBase.startsWith("file://")) {
        return error("--agent-command só é aceito com --repo-base file://…");
    }
    const [agentBin, ...agentArgs] = (agentCommand ?? "claude")
        .split(WHITESPACE)
        .filter((part) => part !== "")
        .map((part) => resolveFrom(cwd, part));
    return {
        command: "start",
        home,
        runner: flags.text("--runner") ?? null,
        apiUrl: flags.text("--api") ?? null,
        pollIntervalMs: seconds * MS_PER_SECOND,
        repoBase,
        keepWorktrees: flags.has("--keep-worktrees"),
        agent: { command: agentBin, args: agentArgs },
        permissions: flags.has(SKIP_PERMISSIONS_FLAG)
            ? { mode: "skip" }
            : { mode: "acceptEdits", allow: [] },
    };
}

export function parseArgs(
    argv: string[],
    env: NodeJS.ProcessEnv = process.env,
    cwd = env.INIT_CWD ?? process.cwd()
): ParsedArgs {
    const [command, ...rest] = argv;
    const { flags, positional } = readFlags(rest);
    const home = path.resolve(cwd, flags.text("--home") ?? defaultHome(env));

    if (command === "start") {
        return parseStart(flags, home, cwd);
    }
    if (command === "list") {
        return { command: "list", home };
    }
    if (command === "version" || command === "--version") {
        return { command: "version" };
    }
    if (command !== "register") {
        return error(USAGE);
    }
    const [code] = positional;
    if (code === undefined) {
        return error("informe o código gerado no board");
    }
    return {
        command: "register",
        home,
        code,
        apiUrl: flags.text("--api") ?? null,
        name: flags.text("--name") ?? null,
    };
}

const pad = (value: number) => String(value).padStart(2, "0");

function clock(date = new Date()): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Every line carries the runner's short id, so two terminals on one machine read apart. */
export function createSay(runnerId: string | null) {
    const tag =
        runnerId === null ? "runner" : `runner ${shortRunnerId(runnerId)}`;
    return (line: string) =>
        process.stdout.write(`[${tag} ${clock()}] ${line}\n`);
}

const say = createSay(null);

/** Written by install-bin next to the installed copy; a run from the checkout has none. */
export function runnerVersion(): string {
    try {
        return readFileSync(
            path.join(import.meta.dirname, "..", "VERSION"),
            "utf8"
        ).trim();
    } catch {
        return "rodando do checkout (pnpm --filter runner cli)";
    }
}

const describeRunner = (credential: RunnerConfig) =>
    `${credential.name} (id ${shortRunnerId(credential.runnerId)} · token terminando em ${tokenEnding(credential.token)})`;

async function register(options: RegisterOptions): Promise<number> {
    const existing = await listCredentials(options.home);
    const apiUrl = options.apiUrl ?? existing.at(-1)?.apiUrl ?? DEFAULT_API_URL;
    const name = options.name ?? nextRunnerName(defaultRunnerName(), existing);
    try {
        const result = await registerRunner(apiUrl, options.code, name);
        const credential: RunnerConfig = {
            apiUrl,
            runnerId: result.runnerId,
            name: result.name,
            token: result.token,
            registeredAt: new Date().toISOString(),
        };
        const file = await saveCredential(options.home, credential);
        say(
            `registrado ${describeRunner(credential)} em ${apiUrl}; credencial em ${file} (modo 0600)`
        );
        const total = existing.length + 1;
        say(
            total === 1
                ? 'rode "agent-board-runner start" para ele buscar trabalho'
                : `${total} runners nesta máquina; cada "agent-board-runner start", num terminal, roda o próximo livre`
        );
        return 0;
    } catch (failure) {
        say(`registro recusado: ${(failure as Error).message}`);
        return 1;
    }
}

async function list(options: ListOptions): Promise<number> {
    const credentials = await listCredentials(options.home);
    if (credentials.length === 0) {
        say(`nenhum runner registrado em ${options.home}`);
        return 0;
    }
    for (const credential of credentials) {
        const pid = runnerHolder(options.home, credential.runnerId);
        say(
            `${describeRunner(credential)} · ${credential.apiUrl} · ${pid === null ? "parado" : `rodando (pid ${pid})`}`
        );
    }
    return 0;
}

const PICK_REFUSAL = {
    none: 'nenhum runner registrado; gere um código no board e rode "agent-board-runner register <código>"',
    all_busy:
        'todos os runners desta máquina já estão rodando; para mais um, gere um código no board e rode "agent-board-runner register <código>"',
    not_found: "nenhum runner registrado com esse id ou nome",
    ambiguous: "mais de um runner começa com esse id; use mais caracteres",
} as const;

async function start(options: StartOptions): Promise<number> {
    const credentials = (await listCredentials(options.home)).filter(
        (credential) =>
            options.apiUrl === null ||
            credential.apiUrl.replace(TRAILING_SLASH, "") ===
                options.apiUrl.replace(TRAILING_SLASH, "")
    );
    const pick = pickCredential(
        credentials,
        (runnerId) => runnerHolder(options.home, runnerId) !== null,
        options.runner
    );
    if (!pick.ok) {
        say(
            pick.reason === "none" && options.apiUrl !== null
                ? `nenhum runner registrado para ${options.apiUrl}; registre um com "agent-board-runner register <código> --api ${options.apiUrl}"`
                : PICK_REFUSAL[pick.reason]
        );
        return 1;
    }
    const config = pick.credential;
    const lock = await acquireRunnerLock(options.home, config.runnerId);
    if (!lock.ok) {
        say(
            `${describeRunner(config)} já está rodando em outro terminal (pid ${lock.pid})`
        );
        return 1;
    }
    const log = createSay(config.runnerId);
    const runner = { name: config.name, id: config.runnerId };
    const api = createRunnerApi(config.apiUrl, config.token);
    if (options.permissions.mode === "skip") {
        process.stderr.write(
            [
                "",
                `ATENÇÃO: ${SKIP_PERMISSIONS_FLAG} ligado.`,
                "As sessões do Claude vão rodar qualquer comando sem pedir permissão nesta máquina.",
                "Só os hooks do repositório e as regras do GitHub ficam como rede de proteção.",
                "",
            ].join("\n")
        );
    }
    log(`${describeRunner(config)} · pasta ${options.home}`);
    log(`versão ${runnerVersion()}`);
    await reportLeftovers(await sweepLeftoverRuns(runnerPaths(options.home)), {
        api,
        runner,
        log,
    });
    const controller = new AbortController();
    process.on(
        "SIGINT",
        createInterruptHandler({
            onFirst: () => {
                log(
                    "encerrando; uma etapa em andamento vai ser reportada como interrompida (Ctrl+C de novo sai na hora)"
                );
                controller.abort();
            },
            onForce: () => {
                killAgentsNow();
                process.exit(EXIT_INTERRUPTED);
            },
        })
    );
    log(
        `buscando trabalho em ${config.apiUrl} a cada ${options.pollIntervalMs / MS_PER_SECOND} s`
    );
    const end = await pollForWork({
        apiUrl: config.apiUrl,
        runner,
        home: options.home,
        repoBase: options.repoBase,
        agent: options.agent,
        permissions: options.permissions,
        keepWorktrees: options.keepWorktrees,
        api,
        log,
        pollIntervalMs: options.pollIntervalMs,
        signal: controller.signal,
    });
    if (end.reason === "refused" && end.code === "RUNNER_REVOKED") {
        await removeCredential(options.home, config.runnerId);
        log(
            "runner revogado no board; a credencial dele saiu desta máquina. Rode start de novo para usar outro runner registrado"
        );
        return 1;
    }
    if (end.reason === "refused") {
        log(
            `o board recusou o token do runner (${end.code}); confira se ${config.apiUrl} é a API certa ou registre de novo`
        );
        return 1;
    }
    return 0;
}

export function main(argv: string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (parsed.command === "error") {
        process.stderr.write(`${parsed.message}\n`);
        return Promise.resolve(EXIT_USAGE);
    }
    if (parsed.command === "version") {
        process.stdout.write(`${runnerVersion()}\n`);
        return Promise.resolve(0);
    }
    if (parsed.command === "register") {
        return register(parsed);
    }
    return parsed.command === "list" ? list(parsed) : start(parsed);
}

function isEntryPoint(): boolean {
    const entry = process.argv[1];
    if (entry === undefined) {
        return false;
    }
    try {
        return import.meta.url === pathToFileURL(realpathSync(entry)).href;
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    main(process.argv.slice(2)).then((code) => process.exit(code));
}
