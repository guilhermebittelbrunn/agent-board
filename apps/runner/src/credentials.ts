import { chmod, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensurePrivateDir, type RunnerConfig, runnerPaths } from "./config.ts";

const PRIVATE_FILE_MODE = 0o600;
const RUNNER_ID = /^[A-Za-z0-9_-]{1,200}$/;
const JSON_SUFFIX = ".json";
/** The board's limit for a runner name. */
const MAX_NAME_LENGTH = 40;

function parseCredential(raw: string): RunnerConfig | null {
    try {
        const parsed = JSON.parse(raw) as Partial<RunnerConfig>;
        if (
            typeof parsed.apiUrl === "string" &&
            typeof parsed.runnerId === "string" &&
            RUNNER_ID.test(parsed.runnerId) &&
            typeof parsed.name === "string" &&
            typeof parsed.token === "string"
        ) {
            return {
                apiUrl: parsed.apiUrl,
                runnerId: parsed.runnerId,
                name: parsed.name,
                token: parsed.token,
                registeredAt:
                    typeof parsed.registeredAt === "string"
                        ? parsed.registeredAt
                        : "",
            };
        }
        return null;
    } catch {
        return null;
    }
}

const credentialFile = (home: string, runnerId: string) =>
    path.join(runnerPaths(home).credentials, `${runnerId}${JSON_SUFFIX}`);

/** The token is a credential: readable only by this user, never inside a repository. */
export async function saveCredential(
    home: string,
    credential: RunnerConfig
): Promise<string> {
    if (!RUNNER_ID.test(credential.runnerId)) {
        throw new Error("id de runner fora do formato esperado");
    }
    await ensurePrivateDir(runnerPaths(home).credentials);
    const file = credentialFile(home, credential.runnerId);
    await writeFile(file, `${JSON.stringify(credential, null, 2)}\n`, {
        mode: PRIVATE_FILE_MODE,
    });
    await chmod(file, PRIVATE_FILE_MODE);
    return file;
}

export async function removeCredential(
    home: string,
    runnerId: string
): Promise<void> {
    if (RUNNER_ID.test(runnerId)) {
        await rm(credentialFile(home, runnerId), { force: true });
    }
}

/** A folder from before several runners shared one home keeps its runner, moved to `runners`. */
async function migrateLegacyConfig(home: string): Promise<void> {
    const legacy = runnerPaths(home).legacyConfig;
    const raw = await readFile(legacy, "utf8").catch(() => null);
    if (raw === null) {
        return;
    }
    const credential = parseCredential(raw);
    if (credential !== null) {
        await saveCredential(home, credential);
    }
    await rm(legacy, { force: true });
}

/** Every runner registered in this folder, oldest first. */
export async function listCredentials(home: string): Promise<RunnerConfig[]> {
    await migrateLegacyConfig(home);
    const dir = runnerPaths(home).credentials;
    const files = await readdir(dir).catch(() => [] as string[]);
    const credentials: RunnerConfig[] = [];
    for (const file of files.filter((name) => name.endsWith(JSON_SUFFIX))) {
        const credential = parseCredential(
            await readFile(path.join(dir, file), "utf8").catch(() => "")
        );
        if (credential !== null) {
            credentials.push(credential);
        }
    }
    return credentials.sort(
        (left, right) =>
            left.registeredAt.localeCompare(right.registeredAt) ||
            left.runnerId.localeCompare(right.runnerId)
    );
}

export type CredentialPick =
    | { ok: true; credential: RunnerConfig }
    | { ok: false; reason: "none" | "all_busy" | "not_found" | "ambiguous" };

/**
 * The runner a new `start` takes: the one asked for by id, id prefix or name, or else the
 * oldest one no other terminal is running.
 */
export function pickCredential(
    credentials: RunnerConfig[],
    isRunning: (runnerId: string) => boolean,
    wanted: string | null
): CredentialPick {
    if (credentials.length === 0) {
        return { ok: false, reason: "none" };
    }
    if (wanted !== null) {
        const matches = credentials.filter(
            (credential) =>
                credential.runnerId.startsWith(wanted) ||
                credential.name === wanted
        );
        if (matches.length === 0) {
            return { ok: false, reason: "not_found" };
        }
        if (matches.length > 1) {
            return { ok: false, reason: "ambiguous" };
        }
        return { ok: true, credential: matches[0] as RunnerConfig };
    }
    const free = credentials.find(
        (credential) => !isRunning(credential.runnerId)
    );
    return free === undefined
        ? { ok: false, reason: "all_busy" }
        : { ok: true, credential: free };
}

/**
 * The name a new runner gets when none is given: the host name, with a number when another
 * runner of this machine already has it, so the board's list reads apart at a glance.
 */
export function nextRunnerName(
    base: string,
    credentials: Pick<RunnerConfig, "name">[]
): string {
    const taken = new Set(credentials.map((credential) => credential.name));
    if (!taken.has(base)) {
        return base;
    }
    let suffix = 2;
    const numbered = () =>
        `${base.slice(0, MAX_NAME_LENGTH - String(suffix).length - 1)}-${suffix}`;
    while (taken.has(numbered())) {
        suffix += 1;
    }
    return numbered();
}
