import type {
    RunnerClaimResult,
    RunnerFinishInput,
    RunnerFinishResult,
    RunnerHeartbeatResult,
    RunnerRegisterResult,
} from "@repo/kanban-contract";

export const isUnauthorized = (error: unknown): error is ApiError =>
    error instanceof ApiError && error.status === HTTP_UNAUTHORIZED;

export class ApiError extends Error {
    readonly status: number;
    readonly code: string | null;

    constructor(status: number, code: string | null) {
        super(code ?? `HTTP ${status}`);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

type Fetch = typeof fetch;

async function call<T>(
    fetchImpl: Fetch,
    url: string,
    token: string | null,
    body: unknown
): Promise<T> {
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };
    if (token !== null) {
        headers.authorization = `Bearer ${token}`;
    }
    const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
    });
    const payload = (await response.json().catch(() => null)) as {
        data?: T;
        error?: { code?: string };
    } | null;
    if (!response.ok) {
        throw new ApiError(response.status, payload?.error?.code ?? null);
    }
    return payload?.data as T;
}

export type RunnerApi = {
    claim(): Promise<RunnerClaimResult>;
    heartbeat(runId: string, turns: number): Promise<RunnerHeartbeatResult>;
    finish(
        runId: string,
        input: RunnerFinishInput
    ): Promise<RunnerFinishResult>;
    tool(runToken: string, name: string, input: unknown): Promise<unknown>;
};

const TRAILING_SLASH = /\/$/;
const HTTP_UNAUTHORIZED = 401;

const trim = (url: string) => url.replace(TRAILING_SLASH, "");

export function registerRunner(
    apiUrl: string,
    code: string,
    name: string,
    fetchImpl: Fetch = fetch
): Promise<RunnerRegisterResult> {
    return call(fetchImpl, `${trim(apiUrl)}/runner/register`, null, {
        code,
        name,
    });
}

export function createRunnerApi(
    apiUrl: string,
    token: string,
    fetchImpl: Fetch = fetch
): RunnerApi {
    const base = trim(apiUrl);
    return {
        claim: () => call(fetchImpl, `${base}/runner/claim`, token, {}),
        heartbeat: (runId, turns) =>
            call(
                fetchImpl,
                `${base}/runner/runs/${encodeURIComponent(runId)}/heartbeat`,
                token,
                { turns }
            ),
        finish: (runId, input) =>
            call(
                fetchImpl,
                `${base}/runner/runs/${encodeURIComponent(runId)}/finish`,
                token,
                input
            ),
        tool: (runToken, name, input) =>
            call(
                fetchImpl,
                `${base}/agent/tools/${encodeURIComponent(name)}`,
                runToken,
                input
            ),
    };
}
