import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRunnerApi, registerRunner } from "./api.ts";
import {
    defaultHome,
    defaultRunnerName,
    readConfig,
    runnerPaths,
    writeConfig,
} from "./config.ts";
import { sweepLeftoverRuns } from "./leftovers.ts";
import { pollForWork } from "./poll.ts";
import type { AgentCommand } from "./run-job.ts";
import type { AgentPermissions } from "./session.ts";
import { killAgentsNow } from "./supervisor.ts";

export type StartOptions = {
    command: "start";
    home: string;
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
    apiUrl: string;
    name: string;
};

export type ParsedArgs =
    | StartOptions
    | RegisterOptions
    | { command: "error"; message: string };

const MS_PER_SECOND = 1000;
const EXIT_USAGE = 2;
/** The shell convention for a process ended by Ctrl+C: 128 + SIGINT. */
const EXIT_INTERRUPTED = 130;
const WHITESPACE = /\s+/;
const DEFAULT_API_URL = "http://localhost:3002";
const DEFAULT_POLL_SECONDS = 10;
const DEFAULT_REPO_BASE = "https://github.com";
const SKIP_PERMISSIONS_FLAG = "--dangerously-skip-permissions";

export const USAGE = [
    "uso:",
    "  runner register <código> [--api <url>] [--name <nome>] [--home <dir>]",
    "  runner start [--home <dir>] [--poll-interval <s>] [--repo-base <url>] [--keep-worktrees]",
    `               [${SKIP_PERMISSIONS_FLAG}] [--agent-command <cmd>]`,
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
        apiUrl: flags.text("--api") ?? DEFAULT_API_URL,
        name: flags.text("--name") ?? defaultRunnerName(),
    };
}

const say = (line: string) => process.stdout.write(`[runner] ${line}\n`);

async function register(options: RegisterOptions): Promise<number> {
    try {
        const result = await registerRunner(
            options.apiUrl,
            options.code,
            options.name
        );
        const file = await writeConfig(options.home, {
            apiUrl: options.apiUrl,
            runnerId: result.runnerId,
            name: result.name,
            token: result.token,
        });
        say(
            `registrado como ${result.name}; credencial em ${file} (modo 0600)`
        );
        return 0;
    } catch (failure) {
        say(`registro recusado: ${(failure as Error).message}`);
        return 1;
    }
}

async function start(options: StartOptions): Promise<number> {
    const config = await readConfig(options.home);
    if (config === null) {
        say(
            `sem registro em ${options.home}; rode "register <código>" primeiro`
        );
        return 1;
    }
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
    for (const runId of await sweepLeftoverRuns(runnerPaths(options.home))) {
        say(`limpou o resto da execução interrompida ${runId}`);
    }
    const controller = new AbortController();
    let interrupts = 0;
    process.on("SIGINT", () => {
        interrupts += 1;
        if (interrupts > 1) {
            killAgentsNow();
            process.exit(EXIT_INTERRUPTED);
        }
        say(
            "encerrando; uma etapa em andamento vai ser reportada como interrompida (Ctrl+C de novo sai na hora)"
        );
        controller.abort();
    });
    say(
        `${config.name} buscando trabalho em ${config.apiUrl} a cada ${options.pollIntervalMs / MS_PER_SECOND} s`
    );
    const end = await pollForWork({
        apiUrl: config.apiUrl,
        runnerName: config.name,
        home: options.home,
        repoBase: options.repoBase,
        agent: options.agent,
        permissions: options.permissions,
        keepWorktrees: options.keepWorktrees,
        api: createRunnerApi(config.apiUrl, config.token),
        log: say,
        pollIntervalMs: options.pollIntervalMs,
        signal: controller.signal,
    });
    if (end.reason === "refused") {
        say(
            end.code === "RUNNER_REVOKED"
                ? "runner revogado no board; registre de novo"
                : `o board recusou o token do runner (${end.code}); registre de novo`
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
    return parsed.command === "register" ? register(parsed) : start(parsed);
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
