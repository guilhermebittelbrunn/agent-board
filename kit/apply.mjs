import {
    access,
    copyFile,
    mkdir,
    readdir,
    readFile,
    writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_DIR = dirname(fileURLToPath(import.meta.url));
const START_MARKER = "<!-- board-mode:start -->";
const BOARD_CONFIG = join(".kanban", "board.yml");
const SETUP_SCRIPT = join(".kanban", "setup.sh");
const BOARD_MODE_RULE = join(".claude", "rules", "board-mode.md");
const COMMAND_SECTIONS_DIR = join(KIT_DIR, "commands");

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function copyIfMissing(relativePath, targetDir) {
    const target = join(targetDir, relativePath);
    if (await exists(target)) {
        return `kept ${relativePath}`;
    }
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(KIT_DIR, relativePath), target);
    return `created ${relativePath}`;
}

async function writeBoardConfig(targetDir) {
    const target = join(targetDir, BOARD_CONFIG);
    if (await exists(target)) {
        return `kept ${BOARD_CONFIG}`;
    }
    const template = await readFile(join(KIT_DIR, BOARD_CONFIG), "utf8");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
        target,
        template.replace("name: CHANGE-ME", `name: ${basename(targetDir)}`)
    );
    return `created ${BOARD_CONFIG}`;
}

function insertSection(command, section) {
    if (command.includes(START_MARKER)) {
        return null;
    }
    const lines = command.split("\n");
    const firstHeading = lines.findIndex((line) => line.startsWith("## "));
    if (firstHeading === -1) {
        return `${command.trimEnd()}\n\n${section}`;
    }
    return [
        ...lines.slice(0, firstHeading),
        section.trimEnd(),
        "",
        ...lines.slice(firstHeading),
    ].join("\n");
}

async function patchCommand(targetDir, file) {
    const relativePath = join(".claude", "commands", file);
    const target = join(targetDir, relativePath);
    if (!(await exists(target))) {
        return `skipped ${relativePath} (not found)`;
    }
    const [command, section] = await Promise.all([
        readFile(target, "utf8"),
        readFile(join(COMMAND_SECTIONS_DIR, file), "utf8"),
    ]);
    const patched = insertSection(command, section);
    if (patched === null) {
        return `kept ${relativePath}`;
    }
    await writeFile(target, patched);
    return `patched ${relativePath}`;
}

async function applyKit(targetDir) {
    const sections = await readdir(COMMAND_SECTIONS_DIR);
    return [
        await writeBoardConfig(targetDir),
        await copyIfMissing(SETUP_SCRIPT, targetDir),
        await copyIfMissing(BOARD_MODE_RULE, targetDir),
        ...(await Promise.all(
            sections.map((file) => patchCommand(targetDir, file))
        )),
    ];
}

const [targetArg] = process.argv.slice(2);

if (targetArg === undefined) {
    console.error("Usage: node kit/apply.mjs <path-to-repository>");
    process.exitCode = 1;
} else {
    const results = await applyKit(resolve(targetArg));
    for (const line of results) {
        console.info(line);
    }
}
