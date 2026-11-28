import { execFileSync } from "node:child_process";
import {
    chmod,
    cp,
    lstat,
    mkdir,
    rename,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const COMMAND = "agent-board-runner";
const EXECUTABLE_MODE = 0o755;
const PRIVATE_DIR_MODE = 0o700;
const packageDir = path.resolve(import.meta.dirname, "..");

function option(argv, name) {
    const index = argv.indexOf(name);
    return index !== -1 && argv[index + 1]
        ? path.resolve(argv[index + 1])
        : null;
}

function binDir(argv, env) {
    const chosen = option(argv, "--dir");
    if (chosen !== null) {
        return chosen;
    }
    const onPath = new Set((env.PATH ?? "").split(path.delimiter));
    const candidates = [
        path.join(os.homedir(), ".local", "bin"),
        path.join(os.homedir(), "bin"),
        env.PNPM_HOME,
    ].filter(Boolean);
    return candidates.find((candidate) => onPath.has(candidate)) ?? null;
}

function checkoutVersion() {
    const git = (...args) =>
        execFileSync("git", args, { cwd: packageDir, encoding: "utf8" }).trim();
    try {
        const dirty =
            git("status", "--porcelain", "--", ".") === "" ? "" : "+local";
        return `${git("rev-parse", "--short", "HEAD")}${dirty} (${git("rev-parse", "--abbrev-ref", "HEAD")})`;
    } catch {
        return "sem git";
    }
}

/**
 * The runner only imports Node's own modules at run time, so its sources run on their own. A
 * copy keeps the command independent of the checkout: switching branches or deleting the clone
 * does not change the runners already installed. Installing again swaps the copy whole.
 */
async function installCopy(home) {
    const app = path.join(home, "app");
    const next = `${app}.next`;
    const previous = `${app}.previous`;
    await mkdir(home, { recursive: true, mode: PRIVATE_DIR_MODE });
    await rm(next, { recursive: true, force: true });
    await cp(path.join(packageDir, "src"), path.join(next, "src"), {
        recursive: true,
    });
    await cp(path.join(packageDir, "bin"), path.join(next, "bin"), {
        recursive: true,
    });
    await chmod(path.join(next, "bin", COMMAND), EXECUTABLE_MODE);
    await writeFile(path.join(next, "package.json"), '{ "type": "module" }\n');
    const version = `${checkoutVersion()} · instalado em ${new Date().toISOString()}`;
    await writeFile(path.join(next, "VERSION"), `${version}\n`);
    await rm(previous, { recursive: true, force: true });
    await rename(app, previous).catch(() => null);
    await rename(next, app);
    await rm(previous, { recursive: true, force: true });
    return { app, version };
}

async function link(dir, target) {
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, COMMAND);
    const existing = await lstat(file).catch(() => null);
    if (existing !== null && !existing.isSymbolicLink()) {
        throw new Error(`${file} já existe e não é um link; apague antes`);
    }
    if (existing !== null) {
        await rm(file);
    }
    await symlink(target, file);
    return file;
}

const cliArgs = process.argv.slice(2);
const linkDir = binDir(cliArgs, process.env);
if (linkDir === null) {
    process.stderr.write(
        "nenhuma pasta conhecida no PATH (~/.local/bin, ~/bin, $PNPM_HOME); rode de novo com --dir <pasta no PATH>\n"
    );
    process.exit(1);
}
const runnerHome =
    option(cliArgs, "--home") ??
    (process.env.AGENT_BOARD_RUNNER_HOME ||
        path.join(os.homedir(), ".agent-board-runner"));
const installed = await installCopy(runnerHome);
const linkFile = await link(linkDir, path.join(installed.app, "bin", COMMAND));
process.stdout.write(
    [
        `${COMMAND} ${installed.version}`,
        `cópia em ${installed.app}; comando em ${linkFile}`,
        "terminais com start já abertos seguem na versão anterior até você reiniciá-los",
        "",
    ].join("\n")
);
